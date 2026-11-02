/**
 * ADMIN CATALOGUE WRITES (Supabase)
 *
 * Saves product changes from the admin dashboard. Product rows are written to the
 * products table, which Row Level Security allows only for signed-in admins
 * (public.is_admin()); this module never decides that itself. A write that RLS blocks
 * either fails (insert) or changes no rows (update/delete); both are reported as
 * "not allowed".
 *
 * Stock goes only through public.admin_set_stock (supabase/drafts/stock_concurrency_A_function.sql;
 * stock_concurrency_D_revoke.sql then removes direct stock writes).
 * Each size is sent with the stock the admin saw; if an order, cancellation, return or
 * another admin changed it since, the database saves nothing and returns the live
 * numbers, so a stale screen can never put sold pieces back. Sizes the admin didn't
 * change aren't sent at all.
 *
 * New products get their id before the first attempt, and a stock line already at its
 * new value counts as saved, so retrying a save after an error can't duplicate anything.
 */

import type { Product } from "../types";
import { describeSize, getSizeOptionsFor } from "../utils/sizes.ts";
import { checkStockQuantity, type ProductDraft } from "../utils/productRules.ts";
import { isSupabaseConfigured } from "../utils/supabaseConfig.ts";

export type DbError = { message: string; code?: string; status?: number };
export type DbResult<T> = { data: T; error: null } | { data: null; error: DbError };

export type ProductRow = {
  id?: string;
  name: string;
  description: string;
  collection: string;
  category: string;
  subcategory: string;
  price: number;
  sale_price: number | null;
  image: string;
  additional_images: string[];
  is_featured: boolean;
  is_new_arrival: boolean;
  status: "enabled" | "disabled";
};
/** One size for admin_set_stock: the new stock and the stock the admin saw */
export type StockLine = { size: string; quantity: number; expected: number };
export type StockRequest = { p_product_id: string; p_lines: StockLine[]; p_remove_other_sizes: boolean };

/** The database operations this module needs (Supabase in the app, a fake in tests) */
export interface CatalogueGateway {
  insertProduct(row: ProductRow & { id: string }): Promise<DbResult<{ id: string }[]>>;
  updateProduct(id: string, changes: Partial<ProductRow>): Promise<DbResult<{ id: string }[]>>;
  deleteProduct(id: string): Promise<DbResult<{ id: string }[]>>;
  /** Calls public.admin_set_stock; its jsonb reply is checked by parseStockReply */
  setStock(request: StockRequest): Promise<DbResult<unknown>>;
}

/**
 * stockChanged holds the live stock of the sizes sent when a save was refused because
 * the stock had changed, so the dashboard can show the real numbers.
 */
export type SaveResult =
  | { ok: true; error?: undefined; stockChanged?: undefined }
  | { ok: false; error: string; stockChanged?: Record<string, number> };

const NOT_ALLOWED = "You don't have permission to change products. Sign in again as an admin.";

/** Turns a database or network error into a message for the dashboard */
export const describeWriteError = (error: DbError): string => {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (error.code === "42501" || text.includes("row-level security") || text.includes("permission denied") || text.includes("only admins")) {
    return NOT_ALLOWED;
  }
  if (error.status === 401 || error.code === "PGRST301" || text.includes("jwt")) {
    return "Your admin session has expired. Sign in again, then retry.";
  }
  if (error.code === "55P03") return "This stock is being changed by an order right now, so nothing was saved. Wait a moment and try again.";
  if (error.code === "PGRST202" || error.code === "42883") {
    return "Stock can't be saved yet: the database hasn't been updated for safe stock saving (stock_concurrency_A_function.sql).";
  }
  if (error.code === "23514") return "The database rejected these values. Check the prices, stock and collection.";
  if (error.code === "23503") return "This product no longer exists. Refresh the list.";
  if (text.includes("abort") || text.includes("timeout")) {
    return "Saving took too long. Check your connection and try again; retrying is safe.";
  }
  if (text.includes("fetch") || text.includes("network")) {
    return "Couldn't reach the database, so nothing was saved. Check your connection and try again.";
  }
  if (text.includes("not configured")) return "Product changes can't be saved: the database isn't set up for this site.";
  return "The change couldn't be saved. Please try again.";
};

export const draftToRow = (draft: ProductDraft): ProductRow => ({
  name: draft.name,
  description: draft.description,
  collection: draft.collection,
  category: draft.category,
  subcategory: draft.subcategory,
  price: draft.price,
  sale_price: draft.salePrice ?? null,
  image: draft.image,
  additional_images: draft.additionalImages,
  is_featured: draft.isFeatured,
  is_new_arrival: draft.isNewArrival,
  status: draft.status,
});

type StockReply =
  | { kind: "saved"; current?: undefined; reason?: undefined }
  | { kind: "stock_changed"; current: Record<string, number>; reason?: undefined }
  | { kind: "refused"; reason: string; current?: undefined };

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Reads admin_set_stock's reply; anything unexpected counts as a refusal */
export const parseStockReply = (data: unknown): StockReply => {
  const reply = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (reply.ok === true) return { kind: "saved" };
  if (reply.reason === "stock_changed" && reply.current && typeof reply.current === "object") {
    const current: Record<string, number> = {};
    for (const [size, quantity] of Object.entries(reply.current)) if (isCount(quantity)) current[size] = quantity;
    return { kind: "stock_changed", current };
  }
  return { kind: "refused", reason: typeof reply.reason === "string" ? reply.reason : "unknown" };
};

/** The admin message for a save refused because the stock changed since it was loaded */
export const describeStockChange = (productName: string, lines: StockLine[], current: Record<string, number>): string => {
  const moved = lines
    .filter((l) => current[l.size] !== undefined && current[l.size] !== l.expected)
    .map((l) => `${describeSize(l.size)} is now ${current[l.size]} (you saw ${l.expected})`);
  return (
    `Stock for “${productName}” changed while you were editing, probably because of an order` +
    (moved.length ? `: ${moved.join(", ")}` : "") +
    ". No stock was saved. The latest numbers are shown now; check them and enter the new amount again."
  );
};

const STOCK_REFUSED: Record<string, string> = {
  not_found: "This product no longer exists. Refresh the list.",
  invalid_size: "This product isn't sold in one of those sizes. Refresh the list and try again.",
  invalid: "The database rejected these stock values. Check them and try again.",
};

const failed = (error: DbError): SaveResult => ({ ok: false, error: describeWriteError(error) });

// An update or delete that RLS filters out changes nothing and returns no rows
const noRows = (rows: unknown[] | null): boolean => !rows || rows.length === 0;

// The stock each size of a product had when the dashboard loaded it (a missing row is 0)
const loadedStock = (product: Pick<Product, "sizeStock"> | null, size: string): number => product?.sizeStock?.[size] ?? 0;

const NO_PRODUCT: Pick<Product, "sizeStock"> = { sizeStock: {} };

export class CatalogueAdmin {
  private readonly gateway: () => Promise<CatalogueGateway>;

  constructor(gateway: () => Promise<CatalogueGateway>) {
    this.gateway = gateway;
  }

  /** Adds a product with its size stock (every size starts from 0). Safe to retry with the same id. */
  public async createProduct(id: string, draft: ProductDraft): Promise<SaveResult> {
    const db = await this.gateway();
    const inserted = await db.insertProduct({ id, ...draftToRow(draft) });
    if (inserted.error) {
      // Already created by an earlier attempt that lost its reply: finish it as an edit
      if (inserted.error.code !== "23505") return failed(inserted.error);
      const updated = await this.saveRow(db, id, draft);
      if (!updated.ok) return updated;
    } else if (noRows(inserted.data)) {
      return { ok: false, error: NOT_ALLOWED };
    }
    return this.saveStock(db, id, draft.name, stockLines(draft.sizeStock, NO_PRODUCT), true, false);
  }

  /**
   * Saves every field, and the stock of only the sizes changed from `loaded` (the product
   * as the dashboard showed it). A details-only edit doesn't touch stock. After a category
   * change every size of the new category is saved and the old sizes are removed.
   */
  public async updateProduct(loaded: Product, draft: ProductDraft): Promise<SaveResult> {
    const db = await this.gateway();
    const updated = await this.saveRow(db, loaded.id, draft);
    if (!updated.ok) return updated;
    const categoryChanged = draft.category !== loaded.category;
    const lines = stockLines(draft.sizeStock, loaded).filter((l) => categoryChanged || l.quantity !== l.expected);
    if (lines.length === 0) return { ok: true };
    return this.saveStock(db, loaded.id, draft.name, lines, categoryChanged, true);
  }

  public async deleteProduct(id: string): Promise<SaveResult> {
    const db = await this.gateway();
    const deleted = await db.deleteProduct(id); // stock and reviews go with it (on delete cascade)
    if (deleted.error) return failed(deleted.error);
    if (noRows(deleted.data)) return { ok: false, error: `${NOT_ALLOWED} (Or the product was already deleted.)` };
    return { ok: true };
  }

  public async setStatus(id: string, status: "enabled" | "disabled"): Promise<SaveResult> {
    const db = await this.gateway();
    const updated = await db.updateProduct(id, { status });
    if (updated.error) return failed(updated.error);
    if (noRows(updated.data)) return { ok: false, error: NOT_ALLOWED };
    return { ok: true };
  }

  /** Sets the stock of one size, if it is still what the dashboard showed */
  public async setSizeStock(product: Product, size: string, quantity: number | string): Promise<SaveResult> {
    if (!getSizeOptionsFor(product.category).includes(size)) {
      return { ok: false, error: `${product.category} aren't sold in ${size}.` };
    }
    const checked = checkStockQuantity(quantity);
    if (!checked.ok) return { ok: false, error: checked.error };
    const db = await this.gateway();
    return this.saveStock(db, product.id, product.name, stockLines({ [size]: checked.value }, product), false, false);
  }

  /** Sets every size of a product from the stock shown (used by "+5 All" and "Mark Out") */
  public async setAllSizes(product: Product, quantityFor: (current: number) => number): Promise<SaveResult> {
    const sizeStock: Record<string, number> = {};
    for (const size of getSizeOptionsFor(product.category)) {
      const checked = checkStockQuantity(quantityFor(loadedStock(product, size)));
      if (!checked.ok) return { ok: false, error: checked.error };
      sizeStock[size] = checked.value;
    }
    const db = await this.gateway();
    return this.saveStock(db, product.id, product.name, stockLines(sizeStock, product), false, false);
  }

  private async saveRow(db: CatalogueGateway, id: string, draft: ProductDraft): Promise<SaveResult> {
    const updated = await db.updateProduct(id, draftToRow(draft));
    if (updated.error) return failed(updated.error);
    if (noRows(updated.data)) return { ok: false, error: `${NOT_ALLOWED} (Or the product was deleted.)` };
    return { ok: true };
  }

  // All or nothing: the database refuses every line if one is stale or invalid.
  // detailsSaved says the product row was saved just before, so the message can say so.
  private async saveStock(
    db: CatalogueGateway,
    productId: string,
    productName: string,
    lines: StockLine[],
    replaceSizes: boolean,
    detailsSaved: boolean
  ): Promise<SaveResult> {
    const before = detailsSaved ? "The product details were saved, but its stock wasn't. " : "";
    const saved = await db.setStock({ p_product_id: productId, p_lines: lines, p_remove_other_sizes: replaceSizes });
    if (saved.error) return { ok: false, error: before + describeWriteError(saved.error) };
    const reply = parseStockReply(saved.data);
    if (reply.kind === "saved") return { ok: true };
    if (reply.kind === "stock_changed") {
      return { ok: false, error: before + describeStockChange(productName, lines, reply.current), stockChanged: reply.current };
    }
    return { ok: false, error: before + (STOCK_REFUSED[reply.reason] ?? "The stock couldn't be saved. Please try again.") };
  }
}

// One line per size: the new stock, and the stock `loaded` showed for it
const stockLines = (sizeStock: Record<string, number>, loaded: Pick<Product, "sizeStock">): StockLine[] =>
  Object.entries(sizeStock).map(([size, quantity]) => ({ size, quantity, expected: loadedStock(loaded, size) }));

// Longest wait for one write before it is reported as failed (retrying is safe)
const WRITE_TIMEOUT_MS = 15000;

// Answers every write with an error, for when the database can't be used at all
const unavailableGateway = (message: string): CatalogueGateway => {
  const fail = async () => ({ data: null, error: { message } });
  return { insertProduct: fail, updateProduct: fail, deleteProduct: fail, setStock: fail };
};

const supabaseGateway = async (): Promise<CatalogueGateway> => {
  if (!isSupabaseConfigured()) return unavailableGateway("Supabase is not configured");
  let supabase: typeof import("../utils/supabase").supabase;
  try {
    ({ supabase } = await import("../utils/supabase"));
  } catch {
    return unavailableGateway("network error: could not load the database client");
  }
  const timeout = () => AbortSignal.timeout(WRITE_TIMEOUT_MS);
  const result = async <T>(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<DbResult<T>> => {
    try {
      const { data, error } = await request;
      return error ? { data: null, error: error as DbError } : { data: data as T, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? `${error.name} ${error.message}` : "network error" } };
    }
  };
  return {
    insertProduct: (row) => result(supabase.from("products").insert(row).select("id").abortSignal(timeout())),
    updateProduct: (id, changes) => result(supabase.from("products").update(changes).eq("id", id).select("id").abortSignal(timeout())),
    deleteProduct: (id) => result(supabase.from("products").delete().eq("id", id).select("id").abortSignal(timeout())),
    setStock: (request) => result(supabase.rpc("admin_set_stock", request).abortSignal(timeout())),
  };
};

export const catalogueAdmin = new CatalogueAdmin(supabaseGateway);
