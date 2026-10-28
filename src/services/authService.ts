/**
 * ADMIN AUTHENTICATION (Supabase Auth)
 *
 * Admins sign in with email and password through Supabase Auth. After sign-in,
 * and again whenever a saved session is restored, the database decides whether
 * the account is an admin (public.is_admin(), which checks public.admin_users).
 * Accounts that are not admins are signed straight out.
 *
 * Hiding the dashboard is NOT the security boundary: every write to the catalogue
 * tables is checked by Row Level Security in the database (see
 * supabase/drafts/products_schema.sql). This service only decides what the
 * dashboard shows.
 *
 * Sessions are stored by Supabase in localStorage and refreshed automatically.
 */

import { isSupabaseConfigured } from "../utils/supabaseConfig.ts";

export type AdminAuthState =
  | { status: "loading" }
  | { status: "unavailable" } // Supabase is not configured for this site
  | { status: "signed-out"; notice?: string }
  | { status: "admin"; email: string };

// The parts of the Supabase client this service uses (keeps it testable)
type AuthError = { message: string; status?: number; code?: string } | null;
type Session = { user: { email?: string | null } } | null;

export interface AdminAuthClient {
  auth: {
    getSession(): Promise<{ data: { session: Session }; error: AuthError }>;
    signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { session: Session }; error: AuthError }>;
    signOut(options?: { scope?: "global" | "local" | "others" }): Promise<{ error: AuthError }>;
    onAuthStateChange(callback: (event: string, session: Session) => void): unknown;
  };
  rpc(fn: "is_admin"): PromiseLike<{ data: unknown; error: AuthError }>;
}

export type SignInResult = { ok: true; error?: undefined } | { ok: false; error: string };

const NOT_ADMIN = "This account doesn't have admin access.";
const CHECK_FAILED = "We couldn't confirm admin access. Please try again.";

/** Turns a Supabase Auth error into a message for the sign-in form */
export const describeSignInError = (error: NonNullable<AuthError>): string => {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (text.includes("invalid") && text.includes("credentials")) return "Incorrect email or password.";
  if (text.includes("email_not_confirmed") || text.includes("not confirmed")) {
    return "This email address hasn't been confirmed yet.";
  }
  if (error.status === 429 || text.includes("rate limit") || text.includes("too many")) {
    return "Too many sign-in attempts. Please wait a few minutes and try again.";
  }
  if (text.includes("fetch") || text.includes("network")) {
    return "We couldn't reach the sign-in service. Check your connection and try again.";
  }
  return "Sign-in failed. Please try again.";
};

const loadSupabaseClient = async (): Promise<AdminAuthClient | null> => {
  if (!isSupabaseConfigured()) return null;
  const { supabase } = await import("../utils/supabase");
  return supabase as unknown as AdminAuthClient;
};

export class AuthService {
  private state: AdminAuthState = { status: "loading" };
  private listeners = new Set<(state: AdminAuthState) => void>();
  private client: Promise<AdminAuthClient | null> | null = null;
  private started = false;
  private readonly loadClient: () => Promise<AdminAuthClient | null>;

  constructor(loadClient: () => Promise<AdminAuthClient | null> = loadSupabaseClient) {
    this.loadClient = loadClient;
  }

  public getState(): AdminAuthState {
    return this.state;
  }

  public subscribe(listener: (state: AdminAuthState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Restores a saved session (checking admin access again) and starts listening
   * for sign-outs, such as an expired session. Safe to call more than once.
   */
  public async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const client = await this.getClient();
    if (!client) {
      this.setState({ status: "unavailable" });
      return;
    }

    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") this.setState({ status: "signed-out" });
    });

    let session: Session = null;
    try {
      const { data, error } = await client.auth.getSession();
      session = error ? null : data.session;
    } catch {
      session = null;
    }
    if (!session) {
      this.setState({ status: "signed-out" });
      return;
    }

    const access = await this.checkAdmin(client);
    if (access === "admin") {
      this.setState({ status: "admin", email: session.user.email ?? "" });
    } else {
      await this.signOutLocally(client);
      this.setState({ status: "signed-out", notice: access === "denied" ? NOT_ADMIN : CHECK_FAILED });
    }
  }

  public async signIn(email: string, password: string): Promise<SignInResult> {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return { ok: false, error: "Enter your email address and password." };

    const client = await this.getClient();
    if (!client) return { ok: false, error: "Admin sign-in isn't available on this site right now." };

    let signInError: AuthError;
    let session: Session = null;
    try {
      const result = await client.auth.signInWithPassword({ email: trimmedEmail, password });
      signInError = result.error;
      session = result.data.session;
    } catch (error) {
      signInError = { message: error instanceof Error ? error.message : "network error" };
    }
    if (signInError || !session) {
      return { ok: false, error: signInError ? describeSignInError(signInError) : "Sign-in failed. Please try again." };
    }

    const access = await this.checkAdmin(client);
    if (access !== "admin") {
      await this.signOutLocally(client);
      this.setState({ status: "signed-out" });
      return { ok: false, error: access === "denied" ? NOT_ADMIN : CHECK_FAILED };
    }

    this.setState({ status: "admin", email: session.user.email ?? trimmedEmail });
    return { ok: true };
  }

  /** Signs out on this device. The local session is cleared even if the network call fails. */
  public async signOut(): Promise<void> {
    const client = await this.getClient();
    if (client) await this.signOutLocally(client);
    this.setState({ status: "signed-out" });
  }

  private async signOutLocally(client: AdminAuthClient): Promise<void> {
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      // Supabase removes the stored session even when the network call fails
    }
  }

  // Asks the database whether the signed-in account is an admin
  private async checkAdmin(client: AdminAuthClient): Promise<"admin" | "denied" | "error"> {
    try {
      const { data, error } = await client.rpc("is_admin");
      if (error) return "error";
      return data === true ? "admin" : "denied";
    } catch {
      return "error";
    }
  }

  private getClient(): Promise<AdminAuthClient | null> {
    this.client ??= this.loadClient().catch(() => null);
    return this.client;
  }

  private setState(state: AdminAuthState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

export const authService = new AuthService();
