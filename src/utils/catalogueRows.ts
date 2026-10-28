import type { CollectionType, Product, Review } from "../types";
import { getSizeOptionsFor } from "./sizes.ts";

// Columns read from Supabase, matching supabase/drafts/products_schema.sql
export const PRODUCT_COLUMNS =
  "id, name, description, collection, category, subcategory, price, sale_price, image, additional_images, " +
  "is_featured, is_new_arrival, status, created_at, updated_at, " +
  "product_stock(size, quantity), " +
  "product_reviews(id, author, rating, comment, review_date, verified, brand_reply)";

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null;
const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const wholeNumber = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : undefined);

const toReview = (row: unknown): Review | null => {
  if (!isRow(row)) return null;
  const id = str(row.id);
  const author = str(row.author);
  const rating = wholeNumber(row.rating);
  if (!id || !author || rating === undefined || rating < 1 || rating > 5) return null;
  return {
    id,
    author,
    rating,
    comment: str(row.comment) ?? "",
    date: str(row.review_date) ?? "",
    verified: row.verified === true,
    brandReply: str(row.brand_reply) || undefined,
  };
};

/**
 * Turns one products row (with its stock and reviews) into the site's Product shape.
 * Returns null for a row the storefront cannot show safely.
 */
export const rowToProduct = (row: unknown): Product | null => {
  if (!isRow(row)) return null;
  const id = str(row.id);
  const name = str(row.name);
  const category = str(row.category);
  const image = str(row.image);
  const price = wholeNumber(row.price);
  if (!id || !name || !image || (category !== "Kurtas" && category !== "Sarees") || !price || price <= 0) return null;

  // Every size this kind of piece is sold in, in display order; missing rows count as sold out
  const stockRows = Array.isArray(row.product_stock) ? row.product_stock.filter(isRow) : [];
  const sizeStock: Record<string, number> = {};
  for (const size of getSizeOptionsFor(category)) {
    const quantity = wholeNumber(stockRows.find((s) => s.size === size)?.quantity);
    sizeStock[size] = quantity !== undefined && quantity > 0 ? quantity : 0;
  }

  const salePrice = wholeNumber(row.sale_price);
  const reviews = (Array.isArray(row.product_reviews) ? row.product_reviews : [])
    .map(toReview)
    .filter((r): r is Review => r !== null)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  return {
    id,
    name,
    description: str(row.description) ?? "",
    collection: (category === "Sarees" ? "ayanaa" : "alankritha") as CollectionType,
    category,
    subcategory: str(row.subcategory) || undefined,
    price,
    salePrice: salePrice !== undefined && salePrice > 0 && salePrice <= price ? salePrice : undefined,
    image,
    additionalImages: Array.isArray(row.additional_images) ? row.additional_images.filter((u): u is string => typeof u === "string") : [],
    sizeStock,
    reviews,
    isFeatured: row.is_featured === true,
    isNewArrival: row.is_new_arrival === true,
    status: row.status === "disabled" ? "disabled" : "enabled",
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
};

export const rowsToProducts = (rows: unknown): Product[] =>
  (Array.isArray(rows) ? rows : []).map(rowToProduct).filter((p): p is Product => p !== null);
