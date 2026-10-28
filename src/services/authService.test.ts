import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthService, describeSignInError, type AdminAuthClient, type AdminAuthState } from "./authService.ts";

// A stand-in for the Supabase client: one stored session, a password list and an admin list
function fakeSupabase(options: { users: Record<string, string>; admins: string[]; stored?: string; rpcFails?: boolean; offline?: boolean }) {
  let session: { user: { email: string } } | null = options.stored ? { user: { email: options.stored } } : null;
  const listeners: ((event: string, s: unknown) => void)[] = [];
  const calls: string[] = [];
  const client: AdminAuthClient = {
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      async signInWithPassword({ email, password }) {
        calls.push("signIn");
        if (options.offline) throw new TypeError("Failed to fetch");
        if (options.users[email] !== password) {
          return { data: { session: null }, error: { message: "Invalid login credentials", status: 400, code: "invalid_credentials" } };
        }
        session = { user: { email } };
        return { data: { session }, error: null };
      },
      async signOut() {
        calls.push("signOut");
        session = null;
        listeners.forEach((l) => l("SIGNED_OUT", null));
        return { error: null };
      },
      onAuthStateChange(callback) {
        listeners.push(callback);
      },
    },
    async rpc() {
      calls.push("is_admin");
      if (options.rpcFails) return { data: null, error: { message: "boom" } };
      return { data: session !== null && options.admins.includes(session.user.email), error: null };
    },
  };
  return { client, calls, hasSession: () => session !== null, expire: () => listeners.forEach((l) => l("SIGNED_OUT", null)) };
}

const ADMIN = "owner@anvaya.test";
const CUSTOMER = "shopper@anvaya.test";
const users = { [ADMIN]: "correct-horse", [CUSTOMER]: "shopper-pass" };

test("without Supabase settings admin sign-in is unavailable", async () => {
  const auth = new AuthService(async () => null);
  await auth.init();
  assert.equal(auth.getState().status, "unavailable");
  const result = await auth.signIn(ADMIN, "x");
  assert.equal(result.ok, false);
});

test("no saved session: signed out, dashboard stays closed", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN] });
  const auth = new AuthService(async () => fake.client);
  assert.equal(auth.getState().status, "loading");
  await auth.init();
  assert.equal(auth.getState().status, "signed-out");
});

test("wrong password is refused with a clear message", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN] });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  assert.deepEqual(await auth.signIn(ADMIN, "wrong"), { ok: false, error: "Incorrect email or password." });
  assert.equal(auth.getState().status, "signed-out");
});

test("empty fields are refused before contacting Supabase", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN] });
  const auth = new AuthService(async () => fake.client);
  assert.equal((await auth.signIn("  ", "")).ok, false);
  assert.deepEqual(fake.calls, []);
});

test("a real account that is not an admin is signed straight out", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN] });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  assert.deepEqual(await auth.signIn(CUSTOMER, "shopper-pass"), { ok: false, error: "This account doesn't have admin access." });
  assert.equal(auth.getState().status, "signed-out");
  assert.equal(fake.hasSession(), false);
});

test("an admin signs in, and the database is asked, not the browser", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN] });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  const seen: AdminAuthState[] = [];
  auth.subscribe((s) => seen.push(s));
  assert.deepEqual(await auth.signIn(` ${ADMIN} `, "correct-horse"), { ok: true });
  assert.deepEqual(auth.getState(), { status: "admin", email: ADMIN });
  assert.deepEqual(fake.calls, ["signIn", "is_admin"]);
  assert.equal(seen.at(-1)?.status, "admin");
});

test("if admin access can't be confirmed, the user is signed out", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN], rpcFails: true });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  const result = await auth.signIn(ADMIN, "correct-horse");
  assert.equal(result.ok, false);
  assert.equal(auth.getState().status, "signed-out");
  assert.equal(fake.hasSession(), false);
});

test("a saved admin session is restored after a reload, after re-checking with the database", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN], stored: ADMIN });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  assert.deepEqual(auth.getState(), { status: "admin", email: ADMIN });
  assert.deepEqual(fake.calls, ["is_admin"]);
});

test("a saved session for someone no longer an admin is closed with a notice", async () => {
  const fake = fakeSupabase({ users, admins: [], stored: ADMIN });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  assert.deepEqual(auth.getState(), { status: "signed-out", notice: "This account doesn't have admin access." });
  assert.equal(fake.hasSession(), false);
});

test("sign out ends the session; an expired session also signs out", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN], stored: ADMIN });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  await auth.signOut();
  assert.equal(auth.getState().status, "signed-out");
  assert.equal(fake.hasSession(), false);

  const again = fakeSupabase({ users, admins: [ADMIN], stored: ADMIN });
  const auth2 = new AuthService(async () => again.client);
  await auth2.init();
  again.expire();
  assert.equal(auth2.getState().status, "signed-out");
});

test("network failure during sign-in gives a connection message", async () => {
  const fake = fakeSupabase({ users, admins: [ADMIN], offline: true });
  const auth = new AuthService(async () => fake.client);
  await auth.init();
  assert.deepEqual(await auth.signIn(ADMIN, "correct-horse"), {
    ok: false,
    error: "We couldn't reach the sign-in service. Check your connection and try again.",
  });
});

test("sign-in error messages", () => {
  assert.equal(describeSignInError({ message: "Email not confirmed", code: "email_not_confirmed" }), "This email address hasn't been confirmed yet.");
  assert.match(describeSignInError({ message: "Request rate limit reached", status: 429 }), /Too many/);
  assert.equal(describeSignInError({ message: "Something odd" }), "Sign-in failed. Please try again.");
});
