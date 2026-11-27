import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { CartItem, Product } from "../types";
import { PaymentApi, type FunctionReply } from "./paymentApi.ts";
import {
  isRazorpayId, isValidPaymentSignature, isValidWebhookSignature, keyMode,
} from "../../supabase/functions/_shared/razorpay.ts";

/**
 * The browser side of online payment, against stand-in Edge Function replies that follow
 * supabase/functions/razorpay-create-order and razorpay-verify-payment. Nothing here calls
 * Razorpay or the live database.
 */

const SECRET = "test_secret_not_a_real_key";

const product = { id: "alk3k09", name: "Garden Whisper (Green)", price: 1499, category: "Kurtas" } as Product;
const cart: CartItem[] = [{ product, selectedSize: "M", quantity: 1 } as CartItem];
const customer = { name: "Priya", phone: "9876543210", address: "12 MG Road", city: "Ballari", state: "Karnataka", pincode: "583101" };
const request = { idempotencyKey: "0b6f1c1e-5d0a-4a6b-9a39-2f1f6c1f7a10", cart, customer, expectedTotal: 1499 };

const summary = (paymentStatus: string) => ({
  reference: "ANV-0000000009",
  created_at: "2026-11-26T06:30:00+00:00",
  status: "Pending",
  payment_method: "Razorpay",
  payment_status: paymentStatus,
  customer: { ...customer, email: null },
  items: [{ product_id: "alk3k09", name: "Garden Whisper (Green)", size: "M", quantity: 1, unit_price: 1499, line_total: 1499 }],
  subtotal: 1499, discount: 0, coupon_code: null, shipping: 0, total: 1499,
});

const replying = (reply: FunctionReply) => {
  const calls: { name: string; body: unknown }[] = [];
  const api = new PaymentApi(async (name, body) => {
    calls.push({ name, body });
    return reply;
  });
  return { api, calls };
};

test("start: sends the bag, not an amount, and opens Checkout for the database's total", async () => {
  const { api, calls } = replying({
    status: 200,
    data: { ok: true, key_id: "rzp_test_Abc123", razorpay_order_id: "order_Abc123456", amount: 149900, currency: "INR", order: summary("Awaiting payment") },
  });
  const result = await api.start(request);
  assert.equal(result.kind, "checkout");
  assert.deepEqual(result.ok && result.kind === "checkout" ? result.checkout : null, {
    keyId: "rzp_test_Abc123", razorpayOrderId: "order_Abc123456", amount: 149900, currency: "INR",
  });
  assert.equal(calls[0].name, "razorpay-create-order");
  assert.deepEqual(calls[0].body, {
    idempotency_key: request.idempotencyKey,
    items: [{ product_id: "alk3k09", size: "M", quantity: 1 }],
    customer,
    coupon_code: null,
    expected_total: 1499,
  });
});

test("start: a reply whose amount doesn't match the order total is never opened", async () => {
  const { api } = replying({
    status: 200,
    data: { ok: true, key_id: "rzp_test_Abc123", razorpay_order_id: "order_Abc123456", amount: 100, currency: "INR", order: summary("Awaiting payment") },
  });
  assert.equal((await api.start(request)).kind, "uncertain");
});

test("start: an already-paid retry goes straight to the confirmation", async () => {
  const { api } = replying({ status: 200, data: { ok: true, paid: true, order: summary("Paid") } });
  const result = await api.start(request);
  assert.equal(result.kind, "already_paid");
});

test("start: the database's refusals read the same as at cash checkout", async () => {
  const { api } = replying({ status: 200, data: { ok: false, reason: "invalid_customer", field: "pincode", message: "Please enter a valid 6-digit Indian PIN code." } });
  const result = await api.start(request);
  assert.equal(result.kind, "invalid_customer");
  assert.equal(!result.ok && result.kind === "invalid_customer" ? result.field : null, "pincode");
});

test("start: no answer is uncertain (safe to retry), a missing function is not set up, Razorpay trouble is shown", async () => {
  assert.equal((await replying({ status: 0, data: null }).api.start(request)).kind, "uncertain");
  assert.equal((await replying({ status: 404, data: null }).api.start(request)).kind, "not_set_up");
  const gateway = await replying({ status: 401, data: { ok: false, reason: "gateway_auth", message: "Online payment isn't available right now." } }).api.start(request);
  assert.equal(gateway.kind, "payment_unavailable");
  assert.equal(gateway.message, "Online payment isn't available right now.");
});

test("verify: paid only when the server confirms; a bad signature and no answer say so", async () => {
  const success = { razorpay_order_id: "order_Abc123456", razorpay_payment_id: "pay_Abc123456", razorpay_signature: "a".repeat(64) };
  const paid = await replying({ status: 200, data: { ok: true, order: summary("Paid") } }).api.verify("ANV-0000000009", success);
  assert.equal(paid.ok, true);
  const forged = await replying({ status: 400, data: { ok: false, reason: "invalid_signature" } }).api.verify("ANV-0000000009", success);
  assert.equal(forged.ok, false);
  assert.match(forged.message ?? "", /couldn't verify/);
  const silent = await replying({ status: 0, data: null }).api.verify("ANV-0000000009", success);
  assert.match(silent.message ?? "", /being confirmed/);
  // A "paid" reply for an order that isn't paid is not believed
  const odd = await replying({ status: 200, data: { ok: true, order: summary("Awaiting payment") } }).api.verify("ANV-0000000009", success);
  assert.equal(odd.ok, false);
});

test("signatures: match Razorpay's HMAC-SHA256 and reject anything else", async () => {
  const expected = createHmac("sha256", SECRET).update("order_Abc123456|pay_Abc123456").digest("hex");
  assert.equal(await isValidPaymentSignature("order_Abc123456", "pay_Abc123456", expected, SECRET), true);
  assert.equal(await isValidPaymentSignature("order_Abc123456", "pay_Abc123456", expected.toUpperCase(), SECRET), true);
  assert.equal(await isValidPaymentSignature("order_Other12345", "pay_Abc123456", expected, SECRET), false);
  assert.equal(await isValidPaymentSignature("order_Abc123456", "pay_Abc123456", expected, "wrong_secret"), false);
  assert.equal(await isValidPaymentSignature("order_Abc123456", "pay_Abc123456", "not-hex", SECRET), false);
  assert.equal(await isValidPaymentSignature("order_Abc123456", "pay_Abc123456", expected, ""), false);

  const body = '{"event":"payment.captured","payload":{}}';
  const webhook = createHmac("sha256", SECRET).update(body).digest("hex");
  assert.equal(await isValidWebhookSignature(body, webhook, SECRET), true);
  assert.equal(await isValidWebhookSignature(body + " ", webhook, SECRET), false);
  assert.equal(await isValidWebhookSignature(body, null, SECRET), false);
});

test("ids and key modes", () => {
  assert.equal(keyMode("rzp_test_x"), "test");
  assert.equal(keyMode("rzp_live_x"), "live");
  assert.equal(keyMode("sk_x"), null);
  assert.equal(isRazorpayId("order_Abc123456", "order"), true);
  assert.equal(isRazorpayId("pay_Abc123456", "order"), false);
  assert.equal(isRazorpayId("order_../../x", "order"), false);
});
