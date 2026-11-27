/**
 * Shared plumbing for the Razorpay Edge Functions: CORS, JSON replies, settings and
 * database calls.
 *
 * Settings (Supabase → Edge Functions → Secrets; never in the website or the repository):
 *   RAZORPAY_KEY_ID          rzp_test_... or rzp_live_...
 *   RAZORPAY_KEY_SECRET      the matching key secret
 *   RAZORPAY_WEBHOOK_SECRET  the secret typed when adding the webhook in Razorpay
 *   ALLOWED_ORIGINS          optional, comma-separated, e.g. https://anvaya-cn7.pages.dev
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
 *
 * The database functions these call (payment_*) are callable only with the service role,
 * so the browser can never mark an order paid itself.
 */

export const env = (name: string): string => Deno.env.get(name)?.trim() ?? "";

const allowedOrigins = () =>
  env("ALLOWED_ORIGINS")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export const json = (request: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json" } });

/** Calls a database function with the service role. Throws on a network or database error. */
export async function rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase settings are missing");
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} failed (${response.status}): ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  if (typeof data !== "object" || data === null) throw new Error(`${name} returned no object`);
  return data as Record<string, unknown>;
}

/** Calls the Razorpay API with the key id and secret (Basic auth) */
export async function razorpay(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const credentials = btoa(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`);
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {
    // A reply that isn't JSON is treated as an error below by its status
  }
  return { status: response.status, data };
}
