/**
 * POST /functions/v1/razorpay-verify-payment
 *
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }, as Checkout's
 * success handler receives them. The signature is checked with the key secret against the
 * Razorpay order id our server saved; only then is the order marked paid (payment_mark_paid,
 * which is safe to repeat and also accepts the same payment from the webhook).
 *
 * Replies
 *   200 { ok: true, order }                         paid
 *   400 { ok: false, reason: "invalid_request" }    a field is missing
 *   400 { ok: false, reason: "invalid_signature" }  not marked paid
 *   409 { ok: false, reason }                       unknown order, second payment, wrong amount
 *   500 anything else (the webhook still records the payment when it arrives)
 */

import { env, json, corsHeaders, rpc } from "../_shared/http.ts";
import { isRazorpayId, isValidPaymentSignature } from "../_shared/razorpay.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { ok: false, reason: "method_not_allowed" });

  const keySecret = env("RAZORPAY_KEY_SECRET");
  if (!keySecret) {
    console.error("razorpay-verify-payment: RAZORPAY_KEY_SECRET is not set");
    return json(request, 500, { ok: false, reason: "not_set_up" });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(request, 400, { ok: false, reason: "invalid_request" });
  }
  const orderId = body.razorpay_order_id;
  const paymentId = body.razorpay_payment_id;
  if (!isRazorpayId(orderId, "order") || !isRazorpayId(paymentId, "pay") || typeof body.razorpay_signature !== "string") {
    return json(request, 400, { ok: false, reason: "invalid_request" });
  }

  // The order id is only trusted after the database confirms it is one we created
  // (payment_mark_paid looks it up); the signature proves Razorpay paired it with this payment.
  if (!(await isValidPaymentSignature(orderId, paymentId, body.razorpay_signature, keySecret))) {
    console.warn("razorpay-verify-payment: signature mismatch for", orderId);
    return json(request, 400, { ok: false, reason: "invalid_signature" });
  }

  try {
    const result = await rpc("payment_mark_paid", {
      p_provider_order_id: orderId,
      p_provider_payment_id: paymentId,
      p_amount_paise: null,
      p_event_id: null,
      p_event: null,
    });
    if (result.ok !== true) {
      console.warn("razorpay-verify-payment:", orderId, result.reason);
      return json(request, 409, { ok: false, reason: result.reason });
    }
    return json(request, 200, { ok: true, order: result.order });
  } catch (error) {
    console.error("razorpay-verify-payment:", error instanceof Error ? error.message : error);
    return json(request, 500, { ok: false, reason: "failed" });
  }
});
