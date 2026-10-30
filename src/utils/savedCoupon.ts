/**
 * The coupon code applied in the bag, kept across page reloads.
 *
 * Only the code is stored, never an amount: the bag works the discount out again from the
 * current offers and bag, and checkout has the database price the order with the code
 * (quote_order / place_order), so a stored value can never set a discount by itself.
 */
export const COUPON_STORAGE_KEY = "anvaya_coupon";

// Offer codes look like ALANKRITHA10 or FESTIVE500
const CODE_PATTERN = /^[A-Z0-9_-]{1,32}$/;

/** A stored value as a coupon code, or undefined when it isn't one */
export const parseSavedCoupon = (raw: string | null | undefined): string | undefined => {
  const code = (raw ?? "").trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : undefined;
};

export const loadSavedCoupon = (): string | undefined => {
  try {
    return parseSavedCoupon(localStorage.getItem(COUPON_STORAGE_KEY));
  } catch {
    return undefined; // storage blocked (private mode): the coupon lasts for this visit only
  }
};

export const saveCoupon = (code: string | undefined) => {
  try {
    if (code) localStorage.setItem(COUPON_STORAGE_KEY, code);
    else localStorage.removeItem(COUPON_STORAGE_KEY);
  } catch {
    // storage blocked: nothing to keep
  }
};
