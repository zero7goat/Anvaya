/**
 * POST /functions/v1/razorpay-webhook   (deployed with --no-verify-jwt: Razorpay sends no login)
 *
 * Razorpay's server-to-server notices. They record a payment even when the shopper closed
 * the page before the browser could confirm it, and a refund's final result.
 *
 * Add it in Razorpay Dashboard → Accounts & Settings → Webhooks with this function's URL,
 * a secret of your choosing (saved here as RAZORPAY_WEBHOOK_SECRET) and the events:
 *   payment.captured, order.paid, refund.processed, refund.failed
 *
 * Every notice is checked against X-Razorpay-Signature (HMAC-SHA256 of the raw body) and
 * de-duplicated by its x-razorpay-event-id. Replies 200 once handled or deliberately set
 * aside, so Razorpay stops resending; 500 when the database couldn't be reached, so it
 * tries again later.
 */

import { env, rpc } from "../_shared/http.ts";
import { isValidWebhookSignature } from "../_shared/razorpay.ts";

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const entity = (event: Record<string, unknown>, name: string): Record<string, unknown> | null => {
  const payload = event.payload as Record<string, Record<string, unknown>> | undefined;
  const wrapped = payload?.[name]?.entity;
  return typeof wrapped === "object" && wrapped !== null ? (wrapped as Record<string, unknown>) : null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply(405, { ok: false });

  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) {
    console.error("razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not set");
    return reply(500, { ok: false });
  }

  const raw = await request.text();
  if (!(await isValidWebhookSignature(raw, request.headers.get("X-Razorpay-Signature"), secret))) {
    console.warn("razorpay-webhook: signature mismatch");
    return reply(400, { ok: false });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false });
  }
  const eventId = request.headers.get("x-razorpay-event-id") || null;
  const name = String(event.event ?? "");

  try {
    let result: Record<string, unknown> = { ok: true, ignored: true };
    if (name === "payment.captured" || name === "order.paid") {
      const payment = entity(event, "payment");
      if (payment && typeof payment.order_id === "string" && typeof payment.id === "string") {
        result = await rpc("payment_mark_paid", {
          p_provider_order_id: payment.order_id,
          p_provider_payment_id: payment.id,
          p_amount_paise: Number.isInteger(payment.amount) ? payment.amount : null,
          p_event_id: eventId,
          p_event: name,
        });
        if (result.ok === true && result.needs_refund === true) {
          console.warn("razorpay-webhook: payment received for a cancelled order; refund it", payment.order_id);
        }
      }
    } else if (name === "refund.processed" || name === "refund.failed") {
      const refund = entity(event, "refund");
      if (refund && typeof refund.payment_id === "string") {
        result = await rpc("payment_refund_update", {
          p_provider_payment_id: refund.payment_id,
          p_refund_id: typeof refund.id === "string" ? refund.id : null,
          p_result: name === "refund.processed" ? "processed" : "failed",
          p_amount_paise: Number.isInteger(refund.amount) ? refund.amount : null,
          p_event_id: eventId,
        });
      }
    }
    if (result.ok !== true) console.warn("razorpay-webhook:", name, "set aside:", result.reason);
    return reply(200, { ok: true });
  } catch (error) {
    console.error("razorpay-webhook:", name, error instanceof Error ? error.message : error);
    return reply(500, { ok: false });
  }
});
