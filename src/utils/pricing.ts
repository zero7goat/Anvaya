import type { CartItem, Offer } from "../types";

/**
 * One set of pricing rules for the cart drawer, checkout and the WhatsApp order
 * message, so the totals a shopper sees never disagree between screens.
 * Kept free of runtime imports so it can be unit tested directly with Node.
 */

export interface CartTotals {
  subtotal: number;
  // Coupon in force for this cart (null when none, or the cart no longer qualifies)
  appliedOffer: Offer | null;
  discount: number;
  total: number;
}

export const getUnitPrice = (product: CartItem["product"]) => product.salePrice || product.price;

export const getSubtotal = (items: CartItem[]) =>
  items.reduce((sum, item) => sum + getUnitPrice(item.product) * item.quantity, 0);

// Why a coupon does not apply to this subtotal, or null when it does
export function getOfferIneligibility(offer: Offer, subtotal: number): string | null {
  if (!offer.enabled) return "This coupon is no longer active.";
  if (offer.minSpend && subtotal < offer.minSpend) {
    return `Requires a minimum spend of ₹${offer.minSpend.toLocaleString("en-IN")}.`;
  }
  return null;
}

export function getOfferDiscount(offer: Offer, subtotal: number): number {
  if (subtotal <= 0 || getOfferIneligibility(offer, subtotal)) return 0;
  const raw = offer.type === "percent" ? Math.round((subtotal * offer.discountValue) / 100) : offer.discountValue;
  // A discount can never exceed what the pieces cost
  return Math.min(Math.max(0, raw), subtotal);
}

// Shipping is free on every order, so the total is the pieces less any coupon
export function calculateCartTotals(items: CartItem[], offer: Offer | null): CartTotals {
  const subtotal = getSubtotal(items);
  const discount = offer ? getOfferDiscount(offer, subtotal) : 0;
  return {
    subtotal,
    appliedOffer: discount > 0 ? offer : null,
    discount,
    total: Math.max(0, subtotal - discount),
  };
}
