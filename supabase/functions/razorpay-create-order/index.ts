/**
 * POST /functions/v1/razorpay-create-order
 *
 * Body: { idempotency_key, items, customer, coupon_code, expected_total }, the same as
 * place_order. The amount is never taken from the browser: the database prices the bag,
 * reserves the stock and saves the order (payment_place_order), and the Razorpay order is
 * made for the database's total.
 *
 * Replies
 *   200 { ok: true, key_id, razorpay_order_id, amount, currency, order }    open Checkout
 *   200 { ok: true, paid: true, order }        this checkout was already paid (a retry)
 *   200 { ok: false, reason, ... }             the database refused the order (same reasons
 *                                              as place_order, or order_closed)
 *   400 invalid request · 401 Razorpay refused our keys · 500 anything else
 *
 * Retrying with the same idempotency key returns the same order and Razorpay order, so a
 * shopper who closes the payment window can pay again without a second order.
 */

import { env, json, corsHeaders, razorpay, rpc } from "../_shared/http.ts";
import { keyMode, isRazorpayId } from "../_shared/razorpay.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });

  const keyId = env("RAZORPAY_KEY_ID");
  const mode = keyMode(keyId);
  if (!mode || !env("RAZORPAY_KEY_SECRET")) {
    console.error("razorpay-create-order: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
    return json(request, 500, { ok: false, reason: "not_set_up", message: "Online payment isn't set up yet." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(request, 400, { ok: false, reason: "invalid_request", message: "The request couldn't be read." });
  }
  const key = body.idempotency_key;
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return json(request, 400, { ok: false, reason: "invalid_request", message: "Missing checkout key." });
  }
  if (!Array.isArray(body.items) || typeof body.customer !== "object" || body.customer === null || !Number.isInteger(body.expected_total)) {
    return json(request, 400, { ok: false, reason: "invalid_request", message: "The order details are incomplete." });
  }

  try {
    // 1. Price, reserve stock and save the order (or get the same order back on a retry)
    const placed = await rpc("payment_place_order", {
      p_idempotency_key: key,
      p_items: body.items,
      p_customer: body.customer,
      p_coupon_code: typeof body.coupon_code === "string" ? body.coupon_code : null,
      p_expected_total: body.expected_total,
    });
    if (placed.ok !== true) return json(request, 200, placed);

    const order = placed.order as Record<string, unknown>;
    if (!placed.payable) {
      if (order?.payment_status === "Paid") return json(request, 200, { ok: true, paid: true, order });
      return json(request, 200, {
        ok: false,
        reason: "order_closed",
        message: `Order ${order?.reference} can no longer be paid online. Please contact the boutique.`,
      });
    }

    const total = placed.total;
    if (!Number.isInteger(total) || (total as number) < 1) {
      // Razorpay's minimum is 100 paise (₹1)
      return json(request, 200, { ok: false, reason: "amount_too_small", message: "Orders under ₹1 can't be paid online." });
    }

    // 2. The Razorpay order for this order (made once; a retry reuses the saved one)
    let razorpayOrderId = placed.provider_order_id;
    if (!isRazorpayId(razorpayOrderId, "order")) {
      const created = await razorpay("/orders", {
        amount: (total as number) * 100,
        currency: "INR",
        receipt: order.reference, // ANV-XXXXXXXXXX: unique, under Razorpay's 40 characters
        notes: { reference: order.reference },
      });
      if (created.status === 401) {
        console.error("razorpay-create-order: Razorpay refused the API keys");
        return json(request, 401, { ok: false, reason: "gateway_auth", message: "Online payment isn't available right now." });
      }
      if (created.status !== 200 || !isRazorpayId(created.data.id, "order")) {
        console.error("razorpay-create-order: Razorpay order failed", created.status, JSON.stringify(created.data).slice(0, 300));
        return json(request, 500, {
          ok: false,
          reason: "gateway_error",
          message: `Your order ${order.reference} is saved but the payment couldn't be started. Please try again.`,
        });
      }

      const attached = await rpc("payment_attach_gateway_order", {
        p_order_id: placed.order_id,
        p_provider_order_id: created.data.id,
        p_mode: mode,
      });
      if (attached.ok !== true) {
        return json(request, 200, { ok: false, reason: "order_closed", message: `Order ${order.reference} can no longer be paid online.` });
      }
      razorpayOrderId = attached.provider_order_id;
    }

    return json(request, 200, {
      ok: true,
      key_id: keyId,
      razorpay_order_id: razorpayOrderId,
      amount: (total as number) * 100,
      currency: "INR",
      order,
    });
  } catch (error) {
    console.error("razorpay-create-order:", error instanceof Error ? error.message : error);
    return json(request, 500, { ok: false, reason: "failed", message: "The payment couldn't be started. Please try again." });
  }
});
