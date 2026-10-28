/**
 * ADMIN CATALOGUE WRITES (Supabase)
 *
 * Saves product changes from the admin dashboard to the products and
 * product_stock tables. The database's Row Level Security allows these writes
 * only for signed-in admins (public.is_admin()); this module never decides that
 * itself. A write that RLS blocks either fails (insert) or changes no rows
 * (update/delete); both are reported as "not allowed".
 *
 * Every write sets absolute values and new products get their id before the
 * first attempt, so retrying a save after an error can't duplicate anything.
 */

import type { Product } from "../types";
import { getSizeOptionsFor } from "../utils/sizes.ts";
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
  is_featured: boolean;
  is_new_arrival: boolean;
  status: "enabled" | "disabled";
};
export type StockRow = { product_id: string; size: string; quantity: number };

/** The database operations this module needs (Supabase in the app, a fake in tests) */
export interface CatalogueGateway {
  insertProduct(row: ProductRow & { id: string }): Promise<DbResult<{ id: string }[]>>;
  updateProduct(id: string, changes: Partial<ProductRow>): Promise<DbResult<{ id: string }[]>>;
  deleteProduct(id: string): Promise<DbResult<{ id: string }[]>>;
  upsertStock(rows: StockRow[]): Promise<DbResult<StockRow[]>>;
  deleteStock(productId: string, keepSizes: string[]): Promise<DbResult<StockRow[]>>;
}

export type SaveResult = { ok: true; error?: undefined } | { ok: false; error: string };

const NOT_ALLOWED = "You don't have permission to change products. Sign in again as an admin.";

/** Turns a database or network error into a message for the dashboard */
export const describeWriteError = (error: DbError): string => {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (error.code === "42501" || text.includes("row-level security") || text.includes("permission denied")) return NOT_ALLOWED;
  if (error.status === 401 || error.code === "PGRST301" || text.includes("jwt")) {
    return "Your admin session has expired. Sign in again, then retry.";
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
  is_featured: draft.isFeatured,
  is_new_arrival: draft.isNewArrival,
  status: draft.status,
});

const stockRows = (productId: string, sizeStock: Record<string, number>): StockRow[] =>
  Object.entries(sizeStock).map(([size, quantity]) => ({ product_id: productId, size, quantity }));

const failed = (error: DbError): SaveResult => ({ ok: false, error: describeWriteError(error) });

// An update or delete that RLS filters out changes nothing and returns no rows
const noRows = (rows: unknown[] | null): boolean => !rows || rows.length === 0;

export class CatalogueAdmin {
  private readonly gateway: () => Promise<CatalogueGateway>;

  constructor(gateway: () => Promise<CatalogueGateway>) {
    this.gateway = gateway;
  }

  /** Adds a product with its size stock. Safe to retry with the same id. */
  public async createProduct(id: string, draft: ProductDraft): Promise<SaveResult> {
    const db = await this.gateway();
    const inserted = await db.insertProduct({ id, ...draftToRow(draft) });
    if (inserted.error) {
      // Already created by an earlier attempt that lost its reply: finish it as an edit
      if (inserted.error.code === "23505") return this.updateProduct(id, draft);
      return failed(inserted.error);
    }
    if (noRows(inserted.data)) return { ok: false, error: NOT_ALLOWED };
    return this.saveStock(db, id, draft.sizeStock, true);
  }

  /** Saves every field and the stock for each size this category is sold in */
  public async updateProduct(id: string, draft: ProductDraft): Promise<SaveResult> {
    const db = await this.gateway();
    const updated = await db.updateProduct(id, draftToRow(draft));
    if (updated.error) return failed(updated.error);
    if (noRows(updated.data)) return { ok: false, error: `${NOT_ALLOWED} (Or the product was deleted.)` };
    return this.saveStock(db, id, draft.sizeStock, true);
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

  /** Sets the stock of one size */
  public async setSizeStock(product: Product, size: string, quantity: number | string): Promise<SaveResult> {
    if (!getSizeOptionsFor(product.category).includes(size)) {
      return { ok: false, error: `${product.category} aren't sold in ${size}.` };
    }
    const checked = checkStockQuantity(quantity);
    if (!checked.ok) return { ok: false, error: checked.error };
    const db = await this.gateway();
    return this.saveStock(db, product.id, { [size]: checked.value }, false);
  }

  /** Sets every size of a product from its current stock (used by "+5 All" and "Mark Out") */
  public async setAllSizes(product: Product, quantityFor: (current: number) => number): Promise<SaveResult> {
    const sizeStock: Record<string, number> = {};
    for (const size of getSizeOptionsFor(product.category)) {
      const checked = checkStockQuantity(quantityFor(product.sizeStock?.[size] ?? 0));
      if (!checked.ok) return { ok: false, error: checked.error };
      sizeStock[size] = checked.value;
    }
    const db = await this.gateway();
    return this.saveStock(db, product.id, sizeStock, false);
  }

  private async saveStock(db: CatalogueGateway, productId: string, sizeStock: Record<string, number>, removeOthers: boolean): Promise<SaveResult> {
    const rows = stockRows(productId, sizeStock);
    const saved = await db.upsertStock(rows);
    if (saved.error) return failed(saved.error);
    if (noRows(saved.data)) return { ok: false, error: NOT_ALLOWED };
    if (removeOthers) {
      // Sizes the product is no longer sold in (for example after switching kurta to saree)
      const removed = await db.deleteStock(productId, Object.keys(sizeStock));
      if (removed.error) return failed(removed.error);
    }
    return { ok: true };
  }
}

// Longest wait for one write before it is reported as failed (retrying is safe)
const WRITE_TIMEOUT_MS = 15000;

// Answers every write with an error, for when the database can't be used at all
const unavailableGateway = (message: string): CatalogueGateway => {
  const fail = async () => ({ data: null, error: { message } });
  return { insertProduct: fail, updateProduct: fail, deleteProduct: fail, upsertStock: fail, deleteStock: fail };
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
    upsertStock: (rows) =>
      result(supabase.from("product_stock").upsert(rows, { onConflict: "product_id,size" }).select("product_id, size, quantity").abortSignal(timeout())),
    deleteStock: (productId, keepSizes) =>
      result(
        supabase
          .from("product_stock")
          .delete()
          .eq("product_id", productId)
          .not("size", "in", `(${keepSizes.map((s) => `"${s}"`).join(",")})`)
          .select("product_id, size, quantity")
          .abortSignal(timeout())
      ),
  };
};

export const catalogueAdmin = new CatalogueAdmin(supabaseGateway);
