import type { Review } from "../types";

/**
 * Sample reviews that came with the demo catalogue (supabase/drafts/products_seed.sql and
 * the built-in catalogue in productService). They were not written by customers, so the
 * shop never shows them. Their database rows are kept until the owner decides what to do
 * with them; genuine reviews (any other id) are shown as before.
 */
export const SEEDED_REVIEW_IDS: ReadonlySet<string> = new Set(["rev-01", "rev-02"]);

/** The reviews customers may see: everything except the seeded samples */
export const customerReviews = (reviews: Review[]): Review[] => reviews.filter((r) => !SEEDED_REVIEW_IDS.has(r.id));
