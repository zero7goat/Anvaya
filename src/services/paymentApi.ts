/**
 * ONLINE PAYMENT (Razorpay Standard Checkout)
 *
 * The browser never decides the amount and never marks an order paid. It talks only to
 * the Edge Functions in supabase/functions:
 *   razorpay-create-order    the database prices the bag, reserves the stock and saves the
 *                            order (Awaiting payment); Razorpay gets an order for that total
 *   razorpay-verify-payment  checks Checkout's signature with the key secret, then marks paid
 * The webhook (razorpay-webhook) records the payment too, in case this page is closed first.
 *
 * The public key id comes back from create-order, so the site needs no Razorpay setting of
 * its own and can't end up with a key that doesn't match the server's secret.
 *
 * Kept free of runtime imports beyond ./orderApi.ts so it can be unit tested with Node.
 */

import type { CartItem, Order } from "../types";
import {
  NOT_SET_UP_MESSAGE, parseOrderSummary, readPlaceOrderReply, toRpcItems,
  type PlaceOrderResult, type RpcCustomer,
} from "./orderApi.ts";

/** One call to an Edge Function. status 0 = no answer (network, timeout). */
export type FunctionReply = { status: number; data: unknown };
export type FunctionCaller = (name: string, body: unknown) => Promise<FunctionReply>;

export type CheckoutDetails = { keyId: string; razorpayOrderId: string; amount: number; currency: "INR" };

type Failure = Extract<PlaceOrderResult, { ok: false }>;
export type StartPaymentResult =
  // Open Razorpay Checkout for this saved, unpaid order
  | { ok: true; kind: "checkout"; order: Order; checkout: CheckoutDetails; message?: undefined }
  // This checkout attempt was already paid (a retry after paying)
  | { ok: true; kind: "already_paid"; order: Order; checkout?: undefined; message?: undefined }
  // Nothing to pay: refused by the database, or online payment can't be used now
  | Failure
  | { ok: false; kind: "payment_unavailable"; message: string };

export type VerifyPaymentResult =
  | { ok: true; order: Order; message?: undefined }
  | { ok: false; message: string; order?: undefined };

/** What Checkout's success handler receives */
export type RazorpaySuccess = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const START_UNCERTAIN =
  "We couldn't start the payment. Please try again: it's safe, because if your order was saved you'll get the same order, not a second one.";
const START_FAILED = "The payment couldn't be started. Your bag is saved; please try again.";

// Reasons that come straight from place_order (the database refused the order)
const ORDER_REASONS = ["invalid_customer", "invalid_items", "too_many_lines", "quantity_limit", "unavailable", "price_changed", "too_many_pending", "idempotency_conflict"];

export class PaymentApi {
  private readonly call: FunctionCaller;

  constructor(call: FunctionCaller) {
    this.call = call;
  }

  /** Saves the order (or gets the same one back on a retry) and prepares Razorpay Checkout */
  public async start(request: {
    idempotencyKey: string;
    cart: CartItem[];
    customer: RpcCustomer;
    couponCode?: string;
    expectedTotal: number;
  }): Promise<StartPaymentResult> {
    if (request.cart.length === 0) return { ok: false, kind: "invalid_items", message: "Your bag is empty. Add a piece before paying." };
    if (!Number.isInteger(request.expectedTotal) || request.expectedTotal < 1) {
      return { ok: false, kind: "failed", message: "The order total couldn't be checked. Please review your bag and try again." };
    }

    const { status, data } = await this.call("razorpay-create-order", {
      idempotency_key: request.idempotencyKey,
      items: toRpcItems(request.cart),
      customer: request.customer,
      coupon_code: request.couponCode?.trim() || null,
      expected_total: request.expectedTotal,
    });
    if (status === 0) return { ok: false, kind: "uncertain", message: START_UNCERTAIN };
    if (status === 404) return { ok: false, kind: "not_set_up", message: NOT_SET_UP_MESSAGE };
    if (!isObject(data) || typeof data.ok !== "boolean") {
      return status >= 500 ? { ok: false, kind: "uncertain", message: START_UNCERTAIN } : { ok: false, kind: "failed", message: START_FAILED };
    }

    if (!data.ok) {
      if (ORDER_REASONS.includes(data.reason as string)) return readPlaceOrderReply(data) as Failure;
      if (data.reason === "not_set_up") return { ok: false, kind: "not_set_up", message: NOT_SET_UP_MESSAGE };
      const text = typeof data.message === "string" && data.message ? data.message : START_FAILED;
      return { ok: false, kind: "payment_unavailable", message: text };
    }

    const order = parseOrderSummary(data.order);
    if (!order) return { ok: false, kind: "uncertain", message: START_UNCERTAIN };
    if (data.paid === true) {
      return order.paymentStatus === "Paid" ? { ok: true, kind: "already_paid", order } : { ok: false, kind: "uncertain", message: START_UNCERTAIN };
    }

    // Checkout charges exactly the saved order's total, in paise
    const keyId = data.key_id;
    const razorpayOrderId = data.razorpay_order_id;
    if (
      typeof keyId !== "string" || !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId) ||
      typeof razorpayOrderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId) ||
      data.amount !== order.total * 100 || data.currency !== "INR" ||
      order.paymentMethod !== "Razorpay" || order.paymentStatus !== "Awaiting payment"
    ) {
      return { ok: false, kind: "uncertain", message: START_UNCERTAIN };
    }
    return { ok: true, kind: "checkout", order, checkout: { keyId, razorpayOrderId, amount: order.total * 100, currency: "INR" } };
  }

  /** Sends Checkout's success reply to the server, which checks the signature before marking paid */
  public async verify(reference: string, success: RazorpaySuccess): Promise<VerifyPaymentResult> {
    const { status, data } = await this.call("razorpay-verify-payment", {
      razorpay_order_id: success.razorpay_order_id,
      razorpay_payment_id: success.razorpay_payment_id,
      razorpay_signature: success.razorpay_signature,
    });
    if (status === 200 && isObject(data) && data.ok === true) {
      const order = parseOrderSummary(data.order);
      if (order && order.paymentStatus === "Paid") return { ok: true, order };
    }
    if (status === 400 && isObject(data) && data.reason === "invalid_signature") {
      return {
        ok: false,
        message: `We couldn't verify this payment, so order ${reference} isn't marked paid. If money left your account, contact the boutique with this reference.`,
      };
    }
    return {
      ok: false,
      message: `Your payment is being confirmed. Order ${reference} will show as paid once Razorpay confirms it; if it doesn't within a few minutes, contact the boutique with this reference. Please don't pay again.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Razorpay Checkout script
// ---------------------------------------------------------------------------

export type RazorpayFailure = { error?: { code?: string; description?: string; reason?: string } };
export interface RazorpayCheckout {
  open(): void;
  on(event: "payment.failed", handler: (response: RazorpayFailure) => void): void;
}
export type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckout;

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutScript: Promise<RazorpayConstructor | null> | null = null;

/** Loads Razorpay's checkout.js once, when the shopper first pays (null if it can't load) */
export function loadRazorpayCheckout(): Promise<RazorpayConstructor | null> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  checkoutScript ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve((window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay ?? null);
    script.onerror = () => {
      checkoutScript = null; // allow another try
      script.remove();
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

// ---------------------------------------------------------------------------
// Supabase Edge Functions
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 20000;

const callEdgeFunction: FunctionCaller = async (name, body) => {
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { status: 404, data: null };
  try {
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Not JSON: judged by the status alone
    }
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
};

export const paymentApi = new PaymentApi(callEdgeFunction);
