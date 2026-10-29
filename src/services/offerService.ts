import { Offer } from "../types";

/**
 * ADVERTISED COUPONS
 *
 * The codes the shop shows (offers strip) and pre-checks in the bag. Visitors can't
 * read public.offers (admins only), so the list lives here; it must match that table
 * (a test compares it with orders_schema.sql). The database alone decides at checkout:
 * quote_order and place_order apply a code only if public.offers allows it.
 */
export const INITIAL_SAMPLE_OFFERS: Offer[] = [
  { id: "off-1", title: "Inaugural Store Discount", code: "ALANKRITHA10", discountValue: 10, type: "percent", enabled: true, minSpend: 1500 },
  { id: "off-2", title: "Festive Flat Discount", code: "FESTIVE500", discountValue: 500, type: "flat", enabled: true, minSpend: 4000 }
];

/**
 * IN-MEMORY OFFER REPOSITORY SERVICE LAYER
 */
class OfferService {
  private offers: Offer[];

  constructor() {
    this.offers = [...INITIAL_SAMPLE_OFFERS];
  }

  /**
   * Get all offers
   */
  public getOffers(): Offer[] {
    return this.offers.map(o => ({ ...o }));
  }

  /**
   * Find an enabled offer by its coupon code (case-insensitive)
   */
  public findActiveOfferByCode(code: string): Offer | null {
    const codeUpper = code.trim().toUpperCase();
    const found = this.offers.find(o => o.code === codeUpper && o.enabled);
    return found ? { ...found } : null;
  }
}

export const offerService = new OfferService();
