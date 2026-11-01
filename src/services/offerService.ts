import type { Offer } from "../types";
import { isSupabaseConfigured } from "../utils/supabaseConfig.ts";

/**
 * COUPONS IN THE SHOP
 *
 * Coupons are managed in the admin dashboard and stored in public.offers, which visitors
 * can't read. The bag asks public.coupon_lookup instead: whether any coupon is active
 * (the coupon box shows only then) and the details of one exact code. The database alone
 * decides at checkout: quote_order and place_order apply a code only if public.offers
 * allows it, so this only keeps the bag's preview accurate.
 */

export interface CouponLookup {
  available: boolean; // at least one coupon is switched on
  offer: Offer | null; // the coupon asked for, when it exists and is on
}

// When the database can't be asked: no coupon box and no discount preview
const NONE: CouponLookup = { available: false, offer: null };

/** Reads coupon_lookup's reply; anything unexpected counts as no coupon */
export const parseCouponLookup = (data: unknown): CouponLookup => {
  const reply = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const raw = (reply.offer && typeof reply.offer === "object" ? reply.offer : null) as Record<string, unknown> | null;
  const valid =
    raw &&
    typeof raw.code === "string" &&
    (raw.kind === "percent" || raw.kind === "flat") &&
    typeof raw.value === "number" &&
    typeof raw.min_spend === "number";
  return {
    available: reply.available === true,
    offer: valid
      ? {
          id: raw.code as string,
          code: raw.code as string,
          title: typeof raw.title === "string" ? raw.title : "",
          type: raw.kind as Offer["type"],
          discountValue: raw.value as number,
          minSpend: raw.min_spend as number,
          enabled: true,
        }
      : null,
  };
};

class OfferService {
  /** Asks the database about coupons; pass a code to get that coupon's details */
  public async lookup(code?: string): Promise<CouponLookup> {
    if (!isSupabaseConfigured()) return NONE;
    try {
      const { supabase } = await import("../utils/supabase");
      const { data, error } = await supabase.rpc("coupon_lookup", { p_code: code?.trim() || null }).abortSignal(AbortSignal.timeout(8000));
      return error ? NONE : parseCouponLookup(data);
    } catch {
      return NONE;
    }
  }
}

export const offerService = new OfferService();
