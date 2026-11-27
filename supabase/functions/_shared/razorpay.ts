/**
 * Razorpay signatures, for the Edge Functions (Deno) and their tests (Node).
 * Uses only Web Crypto, which both provide, and no environment access, so the
 * secrets are always passed in by the caller.
 *
 * Checkout success:  hex HMAC-SHA256 of `${order_id}|${payment_id}` with the API key secret,
 *                    where order_id is the one our server created (not the browser's copy).
 * Webhook:           hex HMAC-SHA256 of the raw request body with the webhook secret
 *                    (set in the Razorpay Dashboard; it is not the API key secret).
 */

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that doesn't depend on where they first differ */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isSignature = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);

export async function isValidPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: unknown,
  keySecret: string
): Promise<boolean> {
  if (!orderId || !paymentId || !keySecret || !isSignature(signature)) return false;
  return timingSafeEqual(await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`), signature.toLowerCase());
}

export async function isValidWebhookSignature(rawBody: string, signature: unknown, webhookSecret: string): Promise<boolean> {
  if (!webhookSecret || !isSignature(signature)) return false;
  return timingSafeEqual(await hmacSha256Hex(webhookSecret, rawBody), signature.toLowerCase());
}

/** rzp_test_... keys take test payments only; rzp_live_... keys take real money */
export const keyMode = (keyId: string): "test" | "live" | null =>
  keyId.startsWith("rzp_test_") ? "test" : keyId.startsWith("rzp_live_") ? "live" : null;

// Razorpay ids: a short prefix, an underscore and letters/digits (order_..., pay_..., rfnd_...)
export const isRazorpayId = (value: unknown, prefix: string): value is string =>
  typeof value === "string" && value.length <= 60 && new RegExp(`^${prefix}_[A-Za-z0-9]{6,50}$`).test(value);
