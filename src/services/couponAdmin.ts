/**
 * ADMIN COUPON MANAGEMENT (Supabase)
 *
 * Adds, edits and deletes rows in public.offers from the admin dashboard. Row Level Security
 * allows these writes only for signed-in admins; this module never decides that itself.
 * Checkout reads the same table, so a saved change applies to the next quote straight away.
 * Orders keep the discount recorded on them, so coupon changes never alter past orders.
 */

import { isSupabaseConfigured } from "../utils/supabaseConfig.ts";

export type CouponKind = "percent" | "flat";

export interface Coupon {
  code: string;
  title: string;
  kind: CouponKind;
  value: number;
  min_spend: number;
  enabled: boolean;
}

/** What the coupon form holds (numbers as typed) */
export interface CouponForm {
  code: string;
  title: string;
  kind: CouponKind;
  value: string;
  minSpend: string;
  enabled: boolean;
}

export type CouponCheck = { ok: true; value: Coupon; error?: undefined } | { ok: false; error: string; value?: undefined };

const wholeNumber = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

/** Same rules as public.offers, so a bad value is explained before anything is sent */
export const checkCouponForm = (form: CouponForm): CouponCheck => {
  const code = form.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,30}$/.test(code)) return { ok: false, error: "The code must be 3 to 30 letters or numbers, with no spaces." };
  const title = form.title.trim();
  if (title.length > 100) return { ok: false, error: "The description can be at most 100 characters." };
  const value = wholeNumber(form.value);
  if (value === null || value <= 0 || value > 1000000) return { ok: false, error: "Enter a whole-number discount above 0." };
  if (form.kind === "percent" && value > 100) return { ok: false, error: "A percentage discount can't be more than 100." };
  const minSpend = form.minSpend.trim() === "" ? 0 : wholeNumber(form.minSpend);
  if (minSpend === null || minSpend > 10000000) return { ok: false, error: "Enter the minimum spend in whole rupees, or leave it empty." };
  return { ok: true, value: { code, title, kind: form.kind, value, min_spend: minSpend, enabled: form.enabled } };
};

type DbError = { message: string; code?: string };
type DbResult<T> = { data: T; error: null } | { data: null; error: DbError };

/** The database operations this module needs (Supabase in the app, a fake in tests) */
export interface CouponGateway {
  list(): Promise<DbResult<Coupon[]>>;
  insert(coupon: Coupon): Promise<DbResult<{ code: string }[]>>;
  update(code: string, changes: Omit<Coupon, "code">): Promise<DbResult<{ code: string }[]>>;
  remove(code: string): Promise<DbResult<{ code: string }[]>>;
}

export type CouponResult = { ok: true; error?: undefined } | { ok: false; error: string };
export type CouponList = { ok: true; coupons: Coupon[]; error?: undefined } | { ok: false; error: string; coupons?: undefined };

const NOT_ALLOWED = "You don't have permission to change coupons. Sign in again as an admin.";

export const describeCouponError = (error: DbError): string => {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (error.code === "23505") return "A coupon with this code already exists.";
  if (error.code === "42501" || text.includes("row-level security") || text.includes("permission denied")) return NOT_ALLOWED;
  if (text.includes("jwt")) return "Your admin session has expired. Sign in again, then retry.";
  if (error.code === "23514") return "The database rejected these values. Check the code and discount.";
  if (text.includes("fetch") || text.includes("network") || text.includes("abort") || text.includes("timeout")) {
    return "Couldn't reach the database, so nothing was saved. Check your connection and try again.";
  }
  return "The change couldn't be saved. Please try again.";
};

// An update or delete that RLS filters out changes nothing and returns no rows
const finish = (result: DbResult<{ code: string }[]>, missing: string): CouponResult => {
  if (result.error) return { ok: false, error: describeCouponError(result.error) };
  return result.data && result.data.length > 0 ? { ok: true } : { ok: false, error: missing };
};

export class CouponAdmin {
  private readonly gateway: () => Promise<CouponGateway>;

  constructor(gateway: () => Promise<CouponGateway>) {
    this.gateway = gateway;
  }

  public async list(): Promise<CouponList> {
    const db = await this.gateway();
    const result = await db.list();
    if (result.error) return { ok: false, error: describeCouponError(result.error) };
    return { ok: true, coupons: result.data };
  }

  public async create(coupon: Coupon): Promise<CouponResult> {
    return finish(await (await this.gateway()).insert(coupon), NOT_ALLOWED);
  }

  /** Saves every field except the code, which identifies the coupon */
  public async update({ code, ...changes }: Coupon): Promise<CouponResult> {
    return finish(await (await this.gateway()).update(code, changes), `${NOT_ALLOWED} (Or the coupon was deleted.)`);
  }

  public async remove(code: string): Promise<CouponResult> {
    return finish(await (await this.gateway()).remove(code), `${NOT_ALLOWED} (Or the coupon was already deleted.)`);
  }
}

const COLUMNS = "code, title, kind, value, min_spend, enabled";

const supabaseGateway = async (): Promise<CouponGateway> => {
  const fail = async () => ({ data: null, error: { message: "network error: the database isn't available" } });
  if (!isSupabaseConfigured()) return { list: fail, insert: fail, update: fail, remove: fail };
  const { supabase } = await import("../utils/supabase");
  const timeout = () => AbortSignal.timeout(15000);
  const result = async <T>(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<DbResult<T>> => {
    try {
      const { data, error } = await request;
      return error ? { data: null, error: error as DbError } : { data: data as T, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? `${error.name} ${error.message}` : "network error" } };
    }
  };
  return {
    list: () => result(supabase.from("offers").select(COLUMNS).order("code").abortSignal(timeout())),
    insert: (coupon) => result(supabase.from("offers").insert(coupon).select("code").abortSignal(timeout())),
    update: (code, changes) => result(supabase.from("offers").update(changes).eq("code", code).select("code").abortSignal(timeout())),
    remove: (code) => result(supabase.from("offers").delete().eq("code", code).select("code").abortSignal(timeout())),
  };
};

export const couponAdmin = new CouponAdmin(supabaseGateway);
