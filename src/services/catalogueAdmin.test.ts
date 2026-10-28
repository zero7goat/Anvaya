import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "../types";
import { CatalogueAdmin, describeWriteError, type CatalogueGateway, type DbError, type ProductRow, type StockRow } from "./catalogueAdmin.ts";
import type { ProductDraft } from "../utils/productRules.ts";

/**
 * An in-memory stand-in for the products and product_stock tables that behaves like
 * the real Row Level Security: only admins may write. A blocked insert fails with
 * 42501; a blocked update or delete changes nothing and returns no rows.
 */
function fakeDatabase(options: { admin: boolean; failNext?: DbError; offline?: boolean }) {
  const products = new Map<string, ProductRow & { id: string }>();
  const stock = new Map<string, StockRow>();
  const calls: string[] = [];
  const key = (r: { product_id: string; size: string }) => `${r.product_id}|${r.size}`;
  const guard = <T>(name: string, run: () => { data: T; error: null } | { data: null; error: DbError }) => {
    calls.push(name);
    if (options.offline) return Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } });
    if (options.failNext) {
      const error = options.failNext;
      options.failNext = undefined;
      return Promise.resolve({ data: null, error });
    }
    return Promise.resolve(run());
  };
  const gateway: CatalogueGateway = {
    insertProduct: (row) =>
      guard("insertProduct", () => {
        if (!options.admin) return { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "products"' } };
        if (products.has(row.id)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        products.set(row.id, { ...row });
        return { data: [{ id: row.id }], error: null };
      }),
    updateProduct: (id, changes) =>
      guard("updateProduct", () => {
        const row = products.get(id);
        if (!options.admin || !row) return { data: [], error: null };
        products.set(id, { ...row, ...changes });
        return { data: [{ id }], error: null };
      }),
    deleteProduct: (id) =>
      guard("deleteProduct", () => {
        if (!options.admin || !products.has(id)) return { data: [], error: null };
        products.delete(id);
        for (const [k, r] of stock) if (r.product_id === id) stock.delete(k); // on delete cascade
        return { data: [{ id }], error: null };
      }),
    upsertStock: (rows) =>
      guard("upsertStock", () => {
        if (!options.admin) return { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "product_stock"' } };
        if (rows.some((r) => r.quantity < 0)) return { data: null, error: { code: "23514", message: "violates check constraint" } };
        if (rows.some((r) => !products.has(r.product_id))) return { data: null, error: { code: "23503", message: "violates foreign key" } };
        rows.forEach((r) => stock.set(key(r), { ...r }));
        return { data: rows, error: null };
      }),
    deleteStock: (productId, keepSizes) =>
      guard("deleteStock", () => {
        const removed: StockRow[] = [];
        if (options.admin) {
          for (const [k, r] of stock) if (r.product_id === productId && !keepSizes.includes(r.size)) (stock.delete(k), removed.push(r));
        }
        return { data: removed, error: null };
      }),
  };
  const stockOf = (id: string) =>
    Object.fromEntries([...stock.values()].filter((r) => r.product_id === id).map((r) => [r.size, r.quantity]));
  return { gateway, products, stockOf, calls };
}

const kurta: ProductDraft = {
  name: "Placeholder Kurta",
  description: "Placeholder",
  collection: "alankritha",
  category: "Kurtas",
  subcategory: "A-Line",
  price: 2999,
  salePrice: 1999,
  image: "",
  isFeatured: false,
  isNewArrival: true,
  status: "enabled",
  sizeStock: { S: 1, M: 2, L: 0, XL: 0, XXL: 3 },
};

const asProduct = (id: string, draft: ProductDraft, sizeStock = draft.sizeStock): Product =>
  ({ ...draft, id, reviews: [], sizeStock }) as Product;

test("create saves the product row and every size's stock", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  assert.deepEqual(await admin.createProduct("anv-1", kurta), { ok: true });
  assert.equal(db.products.get("anv-1")?.sale_price, 1999);
  assert.equal(db.products.get("anv-1")?.collection, "alankritha");
  assert.deepEqual(db.stockOf("anv-1"), { S: 1, M: 2, L: 0, XL: 0, XXL: 3 });
});

test("retrying a create that already went through edits it instead of duplicating", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  assert.deepEqual(await admin.createProduct("anv-1", { ...kurta, name: "Renamed" }), { ok: true });
  assert.equal(db.products.size, 1);
  assert.equal(db.products.get("anv-1")?.name, "Renamed");
});

test("edit changes fields; switching a kurta to a saree replaces its sizes", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const saree: ProductDraft = { ...kurta, collection: "ayanaa", category: "Sarees", subcategory: "Organza", salePrice: undefined, sizeStock: { "Free Size": 6 } };
  assert.deepEqual(await admin.updateProduct("anv-1", saree), { ok: true });
  assert.equal(db.products.get("anv-1")?.category, "Sarees");
  assert.equal(db.products.get("anv-1")?.sale_price, null);
  assert.deepEqual(db.stockOf("anv-1"), { "Free Size": 6 });
});

test("delete removes the product and its stock", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  assert.deepEqual(await admin.deleteProduct("anv-1"), { ok: true });
  assert.equal(db.products.size, 0);
  assert.deepEqual(db.stockOf("anv-1"), {});
  assert.equal((await admin.deleteProduct("anv-1")).ok, false); // already gone
});

test("publish / hide changes only the status", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  assert.deepEqual(await admin.setStatus("anv-1", "disabled"), { ok: true });
  assert.equal(db.products.get("anv-1")?.status, "disabled");
  assert.equal(db.products.get("anv-1")?.name, "Placeholder Kurta");
});

test("stock: one size, +5 to every size, and out of stock", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const product = asProduct("anv-1", kurta);
  assert.deepEqual(await admin.setSizeStock(product, "L", "7"), { ok: true });
  assert.equal(db.stockOf("anv-1").L, 7);
  assert.deepEqual(await admin.setAllSizes(product, (q) => q + 5), { ok: true });
  assert.deepEqual(db.stockOf("anv-1"), { S: 6, M: 7, L: 5, XL: 5, XXL: 8 });
  assert.deepEqual(await admin.setAllSizes(product, () => 0), { ok: true });
  assert.deepEqual(db.stockOf("anv-1"), { S: 0, M: 0, L: 0, XL: 0, XXL: 0 });
});

test("invalid stock and wrong sizes are refused before anything is sent", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  const product = asProduct("anv-1", kurta);
  assert.equal((await admin.setSizeStock(product, "M", "-2")).ok, false);
  assert.equal((await admin.setSizeStock(product, "M", "2.5")).ok, false);
  assert.match((await admin.setSizeStock(product, "Free Size", "2")).error!, /aren't sold in Free Size/);
  assert.deepEqual(db.calls, []);
});

test("a signed-in non-admin can't create, edit, hide, restock or delete", async () => {
  const owner = fakeDatabase({ admin: true });
  await new CatalogueAdmin(async () => owner.gateway).createProduct("anv-1", kurta);

  // Same tables, but now RLS sees an account that is not in admin_users
  const stranger = fakeDatabase({ admin: false });
  stranger.products.set("anv-1", owner.products.get("anv-1")!);
  const admin = new CatalogueAdmin(async () => stranger.gateway);
  const product = asProduct("anv-1", kurta);
  const results = [
    await admin.createProduct("anv-2", kurta),
    await admin.updateProduct("anv-1", { ...kurta, price: 1 }),
    await admin.setStatus("anv-1", "disabled"),
    await admin.setSizeStock(product, "S", 99),
    await admin.setAllSizes(product, () => 0),
    await admin.deleteProduct("anv-1"),
  ];
  for (const result of results) {
    assert.equal(result.ok, false);
    assert.match(result.error!, /don't have permission/);
  }
  assert.equal(stranger.products.get("anv-1")?.price, 2999);
  assert.equal(stranger.products.get("anv-1")?.status, "enabled");
  assert.equal(stranger.products.has("anv-2"), false);
});

test("failed requests report a clear error and change nothing", async () => {
  const offline = fakeDatabase({ admin: true, offline: true });
  const result = await new CatalogueAdmin(async () => offline.gateway).createProduct("anv-1", kurta);
  assert.equal(result.ok, false);
  assert.match(result.error!, /Couldn't reach the database/);
  assert.equal(offline.products.size, 0);

  const expired = fakeDatabase({ admin: true, failNext: { message: "JWT expired", code: "PGRST301", status: 401 } });
  assert.match((await new CatalogueAdmin(async () => expired.gateway).createProduct("anv-1", kurta)).error!, /session has expired/);
});

test("a stock save that fails after the product row saved can simply be retried", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  db.gateway.upsertStock = ((original) => async (rows) => {
    db.gateway.upsertStock = original; // fail once
    return { data: null, error: { message: "TypeError: Failed to fetch" } };
  })(db.gateway.upsertStock);
  const changed = { ...kurta, price: 3499, sizeStock: { ...kurta.sizeStock, S: 9 } };
  assert.equal((await admin.updateProduct("anv-1", changed)).ok, false);
  assert.deepEqual(await admin.updateProduct("anv-1", changed), { ok: true });
  assert.equal(db.products.get("anv-1")?.price, 3499);
  assert.equal(db.stockOf("anv-1").S, 9);
});

test("database error messages", () => {
  assert.match(describeWriteError({ code: "23514", message: "check" }), /rejected these values/);
  assert.match(describeWriteError({ message: "AbortError signal timed out" }), /took too long/);
  assert.match(describeWriteError({ message: "permission denied for table products", code: "42501" }), /permission/);
  assert.match(describeWriteError({ message: "Supabase is not configured" }), /isn't set up/);
});
