/**
 * ORDERS (Supabase)
 *
 * Checkout and the admin Orders tab talk to the database only through what
 * supabase/drafts/orders_schema.sql defines:
 *   public.quote_order(p_items jsonb, p_coupon_code text)              visitors: price a bag, no writes
 *   public.place_order(p_idempotency_key uuid, p_items jsonb, p_customer jsonb,
 *                      p_coupon_code text, p_expected_total integer)    visitors: validate, price, reserve stock, record
 *   public.admin_update_order_status(p_order_id uuid, p_status text,
 *                                    p_payment_status text)             admins: status / payment changes
 *   select on public.orders and public.order_items                      admins only (Row Level Security)
 *
 * The database decides prices, discounts, shipping, stock and who may see what; this
 * module never trusts the browser's own figures and never records an order itself.
 * Every answer from the database is checked before use, so a malformed reply is never
 * shown as a placed order.
 *
 * Retrying is safe: each checkout attempt sends one random key, and place_order returns
 * the original order (not a second one) when the same request is sent again.
 *
 * Kept free of runtime imports beyond ./supabaseConfig.ts so it can be unit tested with Node.
 */

import type { CartItem, Order } from "../types";
import { isSupabaseConfigured } from "../utils/supabaseConfig.ts";

export type OrderStatus = Order["status"];
export type PaymentStatus = Order["paymentStatus"];
export type CustomerField = "name" | "phone" | "email" | "address" | "city" | "state" | "pincode";

export type RpcError = { message: string; code?: string; status?: number };
export type RpcResult = { data: unknown; error: RpcError | null };

/** The database calls this module needs (Supabase in the app, a fake in tests) */
export interface OrdersGateway {
  quoteOrder(args: { p_items: RpcItem[]; p_coupon_code: string | null }): Promise<RpcResult>;
  placeOrder(args: {
    p_idempotency_key: string;
    p_items: RpcItem[];
    p_customer: RpcCustomer;
    p_coupon_code: string | null;
    p_expected_total: number;
  }): Promise<RpcResult>;
  updateOrderStatus(args: { p_order_id: string; p_status: string | null; p_payment_status: string | null }): Promise<RpcResult>;
  selectOrders(limit: number): Promise<RpcResult>;
}

export type RpcItem = { product_id: string; size: string; quantity: number };
export type RpcCustomer = {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export interface QuoteLine {
  productId: string;
  name: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type ProblemKind = "not_found" | "not_available" | "invalid_size" | "insufficient_stock";

export interface QuoteProblem {
  productId: string;
  name: string | null; // withheld by the database for hidden or missing products
  size: string;
  requested: number;
  available: number | null; // only for insufficient_stock
  problem: ProblemKind;
}

export type CouponStatus = "none" | "applied" | "invalid" | "below_min_spend";

export interface Quote {
  lines: QuoteLine[];
  problems: QuoteProblem[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  couponStatus: CouponStatus;
  minimumSpend: number | null;
  shipping: number;
  total: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === "string";
const PROBLEMS: ProblemKind[] = ["not_found", "not_available", "invalid_size", "insufficient_stock"];
const COUPON_STATUSES: CouponStatus[] = ["none", "applied", "invalid", "below_min_spend"];

/** A quote from private.price_items, or null if any figure is missing or doesn't add up */
export function parseQuote(raw: unknown): Quote | null {
  if (!isObject(raw) || !Array.isArray(raw.lines) || !Array.isArray(raw.problems)) return null;
  const lines: QuoteLine[] = [];
  for (const l of raw.lines) {
    if (!isObject(l) || !isText(l.product_id) || !isText(l.name) || !isText(l.size)) return null;
    if (!isWhole(l.quantity) || l.quantity < 1 || !isWhole(l.unit_price) || l.unit_price < 1 || !isWhole(l.line_total)) return null;
    if (l.line_total !== l.unit_price * l.quantity) return null;
    lines.push({ productId: l.product_id, name: l.name, size: l.size, quantity: l.quantity, unitPrice: l.unit_price, lineTotal: l.line_total });
  }
  const problems: QuoteProblem[] = [];
  for (const p of raw.problems) {
    if (!isObject(p) || !isText(p.product_id) || !isText(p.size) || !isWhole(p.requested)) return null;
    if (!PROBLEMS.includes(p.problem as ProblemKind)) return null;
    problems.push({
      productId: p.product_id,
      name: isText(p.name) ? p.name : null,
      size: p.size,
      requested: p.requested,
      available: isWhole(p.available) ? p.available : null,
      problem: p.problem as ProblemKind,
    });
  }
  const { subtotal, discount, shipping, total } = raw;
  if (!isWhole(subtotal) || !isWhole(discount) || !isWhole(shipping) || !isWhole(total)) return null;
  if (subtotal !== lines.reduce((sum, l) => sum + l.lineTotal, 0)) return null;
  if (discount > subtotal || total !== Math.max(subtotal - discount + shipping, 0)) return null;
  if (!COUPON_STATUSES.includes(raw.coupon_status as CouponStatus)) return null;
  const couponCode = isText(raw.coupon_code) ? raw.coupon_code : null;
  if ((couponCode !== null) !== discount > 0) return null;
  return {
    lines,
    problems,
    subtotal,
    discount,
    couponCode,
    couponStatus: raw.coupon_status as CouponStatus,
    minimumSpend: isWhole(raw.minimum_spend) ? raw.minimum_spend : null,
    shipping,
    total,
  };
}

/** The bag as place_order and quote_order expect it */
export const toRpcItems = (cart: CartItem[]): RpcItem[] =>
  cart.map((item) => ({ product_id: item.product.id, size: item.selectedSize, quantity: item.quantity }));

/** Why a line can't be ordered, in words for the shopper */
export function describeProblem(problem: QuoteProblem, cartName?: string): string {
  const name = problem.name ?? cartName ?? "A piece in your bag";
  switch (problem.problem) {
    case "insufficient_stock":
      return problem.available
        ? `${name} (${problem.size}): only ${problem.available} left.`
        : `${name} (${problem.size}) is sold out.`;
    case "invalid_size":
      return `${name} isn't available in ${problem.size}.`;
    default:
      return `${name} is no longer available.`;
  }
}

// ---------------------------------------------------------------------------
// Orders as the database returns them
// ---------------------------------------------------------------------------

export const ORDER_REFERENCE = /^ANV-[0-9A-HJKMNP-TV-Z]{10}$/;
const STATUSES: OrderStatus[] = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled", "Returned"];
const PAYMENT_STATUSES: PaymentStatus[] = ["COD - Due", "Paid", "Refunded"];

// Date and time in India, where the boutique works (the database stores UTC)
const indiaParts = (iso: string): { date: string; time: string } | null => {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const shifted = new Date(when.getTime() + 330 * 60 * 1000); // UTC+05:30, no daylight saving
  const text = shifted.toISOString();
  return { date: text.slice(0, 10), time: text.slice(11, 16) };
};

type RawItem = { product_id: unknown; name: unknown; size: unknown; quantity: unknown; unit_price: unknown; line_total: unknown };

const toItems = (raw: unknown): Order["items"] | null => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: Order["items"] = [];
  for (const i of raw as RawItem[]) {
    if (!isObject(i) || !isText(i.name) || !isText(i.size)) return null;
    if (!isWhole(i.quantity) || i.quantity < 1 || !isWhole(i.unit_price) || !isWhole(i.line_total)) return null;
    if (i.line_total !== i.unit_price * i.quantity) return null;
    // product_id is null when the product was deleted after the order (kept as history)
    items.push({ productId: isText(i.product_id) ? i.product_id : "", name: i.name, price: i.unit_price, quantity: i.quantity, selectedSize: i.size });
  }
  return items;
};

type OrderFields = {
  id: string;
  reference: unknown;
  createdAt: unknown;
  status: unknown;
  paymentMethod: unknown;
  paymentStatus: unknown;
  customer: Record<string, unknown>;
  items: unknown;
  subtotal: unknown;
  discount: unknown;
  couponCode: unknown;
  shipping: unknown;
  total: unknown;
};

const buildOrder = (f: OrderFields): Order | null => {
  if (!isText(f.reference) || !ORDER_REFERENCE.test(f.reference) || !isText(f.createdAt)) return null;
  if (!STATUSES.includes(f.status as OrderStatus) || !PAYMENT_STATUSES.includes(f.paymentStatus as PaymentStatus)) return null;
  if (f.paymentMethod !== "COD") return null;
  const c = f.customer;
  if (![c.name, c.phone, c.address, c.city, c.state, c.pincode].every(isText)) return null;
  if (!isWhole(f.subtotal) || !isWhole(f.discount) || !isWhole(f.shipping) || !isWhole(f.total)) return null;
  if (f.total !== f.subtotal - f.discount + f.shipping) return null;
  const items = toItems(f.items);
  if (!items || items.reduce((sum, i) => sum + i.price * i.quantity, 0) !== f.subtotal) return null;
  const when = indiaParts(f.createdAt);
  if (!when) return null;
  return {
    id: f.id,
    reference: f.reference,
    createdAt: f.createdAt,
    date: when.date,
    time: when.time,
    items,
    customerName: c.name as string,
    customerPhone: c.phone as string,
    customerEmail: isText(c.email) ? c.email : "",
    address: c.address as string,
    city: c.city as string,
    state: c.state as string,
    pincode: c.pincode as string,
    subtotal: f.subtotal,
    discount: f.discount,
    couponCode: isText(f.couponCode) ? f.couponCode : undefined,
    shippingCost: f.shipping,
    total: f.total,
    paymentMethod: "COD",
    paymentStatus: f.paymentStatus as PaymentStatus,
    status: f.status as OrderStatus,
  };
};

/** The summary place_order returns (private.order_summary); it has no row id, so id = reference */
export function parseOrderSummary(raw: unknown): Order | null {
  if (!isObject(raw) || !isObject(raw.customer) || !isText(raw.reference)) return null;
  return buildOrder({
    id: raw.reference,
    reference: raw.reference,
    createdAt: raw.created_at,
    status: raw.status,
    paymentMethod: raw.payment_method,
    paymentStatus: raw.payment_status,
    customer: raw.customer,
    items: raw.items,
    subtotal: raw.subtotal,
    discount: raw.discount,
    couponCode: raw.coupon_code,
    shipping: raw.shipping,
    total: raw.total,
  });
}

export const ORDER_COLUMNS =
  "id, reference, created_at, status, payment_method, payment_status, customer_name, customer_phone, customer_email, " +
  "address, city, state, pincode, subtotal, discount, coupon_code, shipping, total, " +
  "order_items (product_id, product_name, size, unit_price, quantity, line_total)";

/** One row of public.orders with its order_items, as an admin reads it */
export function parseOrderRow(raw: unknown): Order | null {
  if (!isObject(raw) || !isText(raw.id)) return null;
  const items = Array.isArray(raw.order_items)
    ? (raw.order_items as Record<string, unknown>[]).map((i) => (isObject(i) ? { ...i, name: i.product_name } : i))
    : raw.order_items;
  return buildOrder({
    id: raw.id,
    reference: raw.reference,
    createdAt: raw.created_at,
    status: raw.status,
    paymentMethod: raw.payment_method,
    paymentStatus: raw.payment_status,
    customer: {
      name: raw.customer_name,
      phone: raw.customer_phone,
      email: raw.customer_email,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      pincode: raw.pincode,
    },
    items,
    subtotal: raw.subtotal,
    discount: raw.discount,
    couponCode: raw.coupon_code,
    shipping: raw.shipping,
    total: raw.total,
  });
}

// ---------------------------------------------------------------------------
// Status rules (the same as private.apply_order_status; the database enforces them)
// ---------------------------------------------------------------------------

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Shipped", "Cancelled"],
  Shipped: ["Delivered", "Returned"],
  Delivered: ["Returned"],
  Cancelled: [],
  Returned: [],
};

export const nextStatuses = (status: OrderStatus): OrderStatus[] => NEXT_STATUSES[status];

/** The payment change an admin can make now, if any */
export function nextPaymentStatus(order: Pick<Order, "status" | "paymentStatus">): PaymentStatus | null {
  if (order.paymentStatus === "COD - Due" && (order.status === "Shipped" || order.status === "Delivered")) return "Paid";
  if (order.paymentStatus === "Paid" && (order.status === "Cancelled" || order.status === "Returned")) return "Refunded";
  return null;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

// Every branch has a kind, and success branches list the failure fields as undefined, so
// callers can narrow without TypeScript's strict mode (which this project doesn't use)
export type QuoteResult =
  | { ok: true; kind: "quoted"; quote: Quote; message?: undefined }
  | { ok: false; kind: "unavailable"; quote: Quote; message: string }
  | { ok: false; kind: "invalid_items"; message: string }
  | { ok: false; kind: "not_set_up" | "failed"; message: string };

export type PlaceOrderResult =
  | { ok: true; kind: "placed"; order: Order; replayed: boolean; message?: undefined }
  | { ok: false; kind: "invalid_customer"; field: CustomerField; message: string }
  // Nothing was placed; the shopper can correct and resend
  | { ok: false; kind: "invalid_items" | "too_many_pending" | "idempotency_conflict"; message: string }
  | { ok: false; kind: "unavailable"; quote: Quote | null; message: string }
  | { ok: false; kind: "price_changed"; quote: Quote; message: string }
  // Online ordering can't be used on this site (not configured, or the database isn't ready)
  | { ok: false; kind: "not_set_up"; message: string }
  // The database answered with an error: the order was rolled back, nothing was placed
  | { ok: false; kind: "failed"; message: string }
  // No clear answer (network, timeout, malformed reply): it may or may not be saved;
  // retrying with the same key is safe and returns the original order if it was
  | { ok: false; kind: "uncertain"; message: string };

export type ListOrdersResult =
  | { ok: true; orders: Order[]; skipped: number; error?: undefined }
  | { ok: false; error: string; orders?: undefined; skipped?: undefined };
export type UpdateStatusResult =
  | { ok: true; changed: boolean; status: OrderStatus; paymentStatus: PaymentStatus; error?: undefined }
  | { ok: false; error: string; changed?: undefined; status?: undefined; paymentStatus?: undefined };

export const NOT_SET_UP_MESSAGE =
  "Online ordering isn't available right now, so nothing was placed. Your bag is saved; please try again later or contact the boutique.";
const FAILED_MESSAGE = "Your order wasn't placed and no stock was reserved. Your bag is saved; please try again.";
const UNCERTAIN_MESSAGE =
  "We couldn't confirm your order. Please try again: it's safe, because if it was saved you'll get the same order, not a second one.";

const CUSTOMER_FIELDS: CustomerField[] = ["name", "phone", "email", "address", "city", "state", "pincode"];
const message = (raw: Record<string, unknown>, fallback: string) => (isText(raw.message) && raw.message ? raw.message : fallback);

// Does this error mean the database or its functions aren't set up for this site?
const isNotSetUp = (error: RpcError) =>
  error.code === "PGRST202" || // function not found
  error.code === "42883" || // undefined function
  error.code === "42501" || // no permission to call it
  error.code === "PGRST205" || // table not found
  error.status === 404 ||
  /not configured|shop settings are missing/i.test(error.message);

// An error with a database code came back from Postgres (even a statement timeout), so
// its transaction was rolled back. Network failures and aborts carry no code.
const isDatabaseAnswer = (error: RpcError) => Boolean(error.code);

const MAX_ORDERS = 500;

export class OrderApi {
  private readonly gateway: () => Promise<OrdersGateway>;

  constructor(gateway: () => Promise<OrdersGateway>) {
    this.gateway = gateway;
  }

  /** What the database would charge for this bag now (no writes) */
  public async quote(cart: CartItem[], couponCode?: string): Promise<QuoteResult> {
    if (cart.length === 0) return { ok: false, kind: "invalid_items", message: "Your bag is empty." };
    const db = await this.gateway();
    const { data, error } = await db.quoteOrder({ p_items: toRpcItems(cart), p_coupon_code: couponCode?.trim() || null });
    if (error) {
      return isNotSetUp(error)
        ? { ok: false, kind: "not_set_up", message: NOT_SET_UP_MESSAGE }
        : { ok: false, kind: "failed", message: "We couldn't check current prices and stock. Please try again." };
    }
    if (!isObject(data) || typeof data.ok !== "boolean") return { ok: false, kind: "failed", message: "We couldn't check current prices and stock. Please try again." };
    if (!isObject(data.quote)) {
      // parse_items refused the bag (empty, too many lines, too many of one piece)
      return { ok: false, kind: "invalid_items", message: message(data, "Some items in your bag are not valid.") };
    }
    const quote = parseQuote(data.quote);
    if (!quote) return { ok: false, kind: "failed", message: "We couldn't check current prices and stock. Please try again." };
    if (!data.ok || quote.problems.length > 0) {
      return { ok: false, kind: "unavailable", quote, message: "Some pieces in your bag aren't available in the quantity chosen." };
    }
    return { ok: true, kind: "quoted", quote };
  }

  /**
   * Places a COD order. Succeeds only when the database confirms the order was saved;
   * the returned order holds the database's own figures and reference.
   */
  public async placeOrder(request: {
    idempotencyKey: string;
    cart: CartItem[];
    customer: RpcCustomer;
    couponCode?: string;
    expectedTotal: number;
  }): Promise<PlaceOrderResult> {
    if (request.cart.length === 0) return { ok: false, kind: "invalid_items", message: "Your bag is empty. Add a piece before placing an order." };
    if (!Number.isInteger(request.expectedTotal) || request.expectedTotal < 0) {
      return { ok: false, kind: "failed", message: "The order total couldn't be checked. Please review your bag and try again." };
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.idempotencyKey)) {
      return { ok: false, kind: "failed", message: FAILED_MESSAGE };
    }

    const db = await this.gateway();
    const { data, error } = await db.placeOrder({
      p_idempotency_key: request.idempotencyKey,
      p_items: toRpcItems(request.cart),
      p_customer: request.customer,
      p_coupon_code: request.couponCode?.trim() || null,
      p_expected_total: request.expectedTotal,
    });

    if (error) {
      if (isNotSetUp(error)) return { ok: false, kind: "not_set_up", message: NOT_SET_UP_MESSAGE };
      if (error.code === "55P03") {
        return { ok: false, kind: "failed", message: "The boutique is busy with another order for these pieces. Please try again in a moment." };
      }
      return isDatabaseAnswer(error) ? { ok: false, kind: "failed", message: FAILED_MESSAGE } : { ok: false, kind: "uncertain", message: UNCERTAIN_MESSAGE };
    }
    if (!isObject(data) || typeof data.ok !== "boolean") return { ok: false, kind: "uncertain", message: UNCERTAIN_MESSAGE };

    if (data.ok) {
      const order = parseOrderSummary(data.order);
      // A "saved" reply we can't read is never shown as a placed order
      if (!order) return { ok: false, kind: "uncertain", message: UNCERTAIN_MESSAGE };
      return { ok: true, kind: "placed", order, replayed: data.replayed === true };
    }

    switch (data.reason) {
      case "invalid_customer": {
        const field = CUSTOMER_FIELDS.includes(data.field as CustomerField) ? (data.field as CustomerField) : "name";
        return { ok: false, kind: "invalid_customer", field, message: message(data, "Please check your delivery details.") };
      }
      case "invalid_items":
      case "too_many_lines":
      case "quantity_limit":
        return { ok: false, kind: "invalid_items", message: message(data, "Some items in your bag are not valid.") };
      case "unavailable":
        return {
          ok: false,
          kind: "unavailable",
          quote: parseQuote(data.quote),
          message: "Some pieces in your bag aren't available in the quantity chosen, so nothing was ordered.",
        };
      case "price_changed": {
        const quote = parseQuote(data.quote);
        if (!quote) return { ok: false, kind: "failed", message: FAILED_MESSAGE };
        return {
          ok: false,
          kind: "price_changed",
          quote,
          message: `Prices changed since you opened checkout, so nothing was ordered yet. The new total is ₹${quote.total.toLocaleString("en-IN")}; please check it and confirm again.`,
        };
      }
      case "too_many_pending":
        return { ok: false, kind: "too_many_pending", message: message(data, "There are already several orders waiting for this phone number.") };
      case "idempotency_conflict":
        return { ok: false, kind: "idempotency_conflict", message: message(data, "Please review your bag and try again.") };
      default:
        return { ok: false, kind: "failed", message: FAILED_MESSAGE };
    }
  }

  /** Every order, newest first (admins only: others get none, by Row Level Security) */
  public async listOrders(): Promise<ListOrdersResult> {
    const db = await this.gateway();
    const { data, error } = await db.selectOrders(MAX_ORDERS);
    if (error) return { ok: false, error: describeAdminError(error, "read") };
    if (!Array.isArray(data)) return { ok: false, error: "The orders couldn't be read. Please refresh." };
    const orders = data.map(parseOrderRow).filter((o): o is Order => o !== null);
    return { ok: true, orders, skipped: data.length - orders.length };
  }

  /** Changes an order's status and/or payment status through admin_update_order_status */
  public async updateStatus(orderId: string, change: { status?: OrderStatus; paymentStatus?: PaymentStatus }): Promise<UpdateStatusResult> {
    if (!change.status && !change.paymentStatus) return { ok: false, error: "Nothing to change." };
    const db = await this.gateway();
    const { data, error } = await db.updateOrderStatus({
      p_order_id: orderId,
      p_status: change.status ?? null,
      p_payment_status: change.paymentStatus ?? null,
    });
    if (error) return { ok: false, error: describeAdminError(error, "update") };
    if (!isObject(data) || typeof data.ok !== "boolean") return { ok: false, error: "The change couldn't be confirmed. Refresh to see the order's current status." };
    if (!data.ok) return { ok: false, error: message(data, "The change couldn't be saved.") };
    if (!STATUSES.includes(data.status as OrderStatus) || !PAYMENT_STATUSES.includes(data.payment_status as PaymentStatus)) {
      return { ok: false, error: "The change couldn't be confirmed. Refresh to see the order's current status." };
    }
    return { ok: true, changed: data.changed === true, status: data.status as OrderStatus, paymentStatus: data.payment_status as PaymentStatus };
  }
}

/** A database or network error, in words for the dashboard */
export function describeAdminError(error: RpcError, action: "read" | "update"): string {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (error.code === "42501" || text.includes("permission denied") || text.includes("only admins")) {
    return "You don't have permission to manage orders. Sign in again as an admin.";
  }
  if (error.status === 401 || error.code === "PGRST301" || text.includes("jwt")) return "Your admin session has expired. Sign in again, then retry.";
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01" || error.code === "42883" || error.status === 404) {
    return "Orders aren't set up in the database yet (orders_schema.sql has not been applied).";
  }
  if (error.code === "55P03") return "This order is being changed elsewhere. Wait a moment and try again.";
  if (text.includes("not configured")) return "Orders can't be loaded: the database isn't set up for this site.";
  if (text.includes("abort") || text.includes("timeout")) {
    return action === "read" ? "Loading orders took too long. Check your connection and refresh." : "The change took too long. Refresh to check whether it was saved.";
  }
  if (text.includes("fetch") || text.includes("network")) {
    return action === "read" ? "Couldn't reach the database. Check your connection and refresh." : "Couldn't reach the database, so the change wasn't saved. Try again.";
  }
  return action === "read" ? "The orders couldn't be loaded. Please refresh." : "The change couldn't be saved. Please try again.";
}

/** A fresh key for one checkout attempt (kept and reused when the attempt is retried) */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Places the order, then (and only then) runs onSaved with the confirmed order, e.g. to
 * open WhatsApp. Nothing is announced for an order the database hasn't confirmed.
 */
export async function placeOrderThen(
  api: OrderApi,
  request: Parameters<OrderApi["placeOrder"]>[0],
  onSaved: (order: Order) => void
): Promise<PlaceOrderResult> {
  const result = await api.placeOrder(request);
  if (result.ok) onSaved(result.order);
  return result;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15000;

const unavailableGateway = (message: string): OrdersGateway => {
  const fail = async (): Promise<RpcResult> => ({ data: null, error: { message } });
  return { quoteOrder: fail, placeOrder: fail, updateOrderStatus: fail, selectOrders: fail };
};

const supabaseGateway = async (): Promise<OrdersGateway> => {
  if (!isSupabaseConfigured()) return unavailableGateway("Supabase is not configured");
  let supabase: typeof import("../utils/supabase").supabase;
  try {
    ({ supabase } = await import("../utils/supabase"));
  } catch {
    return unavailableGateway("network error: could not load the database client");
  }
  const timeout = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const result = async (request: PromiseLike<{ data: unknown; error: unknown }>): Promise<RpcResult> => {
    try {
      const { data, error } = await request;
      return error ? { data: null, error: error as RpcError } : { data, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? `${error.name} ${error.message}` : "network error" } };
    }
  };
  return {
    quoteOrder: (args) => result(supabase.rpc("quote_order", args).abortSignal(timeout())),
    placeOrder: (args) => result(supabase.rpc("place_order", args).abortSignal(timeout())),
    updateOrderStatus: (args) => result(supabase.rpc("admin_update_order_status", args).abortSignal(timeout())),
    selectOrders: (limit) =>
      result(
        supabase
          .from("orders")
          .select(ORDER_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(limit)
          .abortSignal(timeout())
      ),
  };
};

export const orderApi = new OrderApi(supabaseGateway);
