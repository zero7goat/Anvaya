import { Offer } from "../types";

/**
 * SAMPLE PROMOTIONAL OFFERS (DEMO STATE)
 *
 * Mirrors the coupon codes previously served by the Express API so the
 * storefront can validate promo codes entirely in memory.
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
