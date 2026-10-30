import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "../types";
import {
  CatalogueAdmin,
  describeWriteError,
  parseStockReply,
  type CatalogueGateway,
  type DbError,
  type ProductRow,
  type StockRequest,
} from "./catalogueAdmin.ts";
import type { ProductDraft } from "../utils/productRules.ts";

type StockRow = { product_id: string; size: string; quantity: number };
const SIZES: Record<string, string[]> = { Kurtas: ["S", "M", "L", "XL", "XXL"], Sarees: ["Free Size"] };

/**
 * An in-memory stand-in for the products and product_stock tables. Product rows behave
 * like the real Row Level Security: only admins may write; a blocked insert fails with
 * 42501, a blocked update or delete changes nothing and returns no rows. Stock changes
 * only through setStock, which follows public.admin_set_stock: admins only (42501), the
 * whole request is checked first, and if any size's stock is no longer what the admin
 * saw (nor already the new value), nothing is written and the live numbers come back.
 * (The real function is tested against PostgreSQL separately; these tests are about
 * what the dashboard sends and how it reports the replies.)
 */
function fakeDatabase(options: { admin: boolean; failNext?: DbError; offline?: boolean }) {
  const products = new Map<string, ProductRow & { id: string }>();
  const stock = new Map<string, StockRow>();
  const calls: string[] = [];
  const stockRequests: StockRequest[] = [];
  const key = (r: { product_id: string; size: string }) => `${r.product_id}|${r.size}`;
  const qty = (productId: string, size: string) => stock.get(key({ product_id: productId, size }))?.quantity ?? 0;
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
    setStock: (request) =>
      guard("setStock", () => {
        stockRequests.push(structuredClone(request));
        const { p_product_id: id, p_lines: lines, p_remove_other_sizes: replace } = request;
        if (!options.admin) return { data: null, error: { code: "42501", message: "Only admins can change stock." } };
        const product = products.get(id);
        if (!product) return { data: { ok: false, reason: "not_found" }, error: null };
        const sizes = SIZES[product.category];
        const whole = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;
        if (lines.length === 0 || lines.some((l) => !whole(l.quantity) || l.quantity > 9999 || !whole(l.expected))) {
          return { data: { ok: false, reason: "invalid" }, error: null };
        }
        if (lines.some((l) => !sizes.includes(l.size))) return { data: { ok: false, reason: "invalid_size" }, error: null };
        if (replace && !sizes.every((s) => lines.some((l) => l.size === s))) return { data: { ok: false, reason: "invalid" }, error: null };
        const current = Object.fromEntries(lines.map((l) => [l.size, qty(id, l.size)]));
        if (lines.some((l) => current[l.size] !== l.expected && current[l.size] !== l.quantity)) {
          return { data: { ok: false, reason: "stock_changed", current }, error: null };
        }
        lines.forEach((l) => stock.set(key({ product_id: id, size: l.size }), { product_id: id, size: l.size, quantity: l.quantity }));
        if (replace) for (const [k, r] of stock) if (r.product_id === id && !sizes.includes(r.size)) stock.delete(k);
        return { data: { ok: true, changed: true, stock: stockOf(id) }, error: null };
      }),
  };
  function stockOf(id: string) {
    return Object.fromEntries([...stock.values()].filter((r) => r.product_id === id).map((r) => [r.size, r.quantity]));
  }
  // What checkout (place_order) and cancellations/returns do to stock, outside the dashboard
  const customerBuys = (id: string, size: string, n: number) => stock.set(key({ product_id: id, size }), { product_id: id, size, quantity: qty(id, size) - n });
  const stockReturns = (id: string, size: string, n: number) => customerBuys(id, size, -n);
  // The product as the dashboard would load it now (missing rows show as 0)
  const load = (id: string): Product => {
    const row = products.get(id)!;
    const sizeStock = Object.fromEntries(SIZES[row.category].map((s) => [s, qty(id, s)]));
    return { ...row, salePrice: row.sale_price ?? undefined, isFeatured: row.is_featured, isNewArrival: row.is_new_arrival, reviews: [], sizeStock } as unknown as Product;
  };
  return { gateway, products, stockOf, calls, stockRequests, customerBuys, stockReturns, load };
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
  assert.deepEqual(await admin.updateProduct(db.load("anv-1"), saree), { ok: true });
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
  // The dashboard reloads the catalogue after every save, so each action starts from fresh numbers
  assert.deepEqual(await admin.setSizeStock(db.load("anv-1"), "L", "7"), { ok: true });
  assert.equal(db.stockOf("anv-1").L, 7);
  assert.deepEqual(await admin.setAllSizes(db.load("anv-1"), (q) => q + 5), { ok: true });
  assert.deepEqual(db.stockOf("anv-1"), { S: 6, M: 7, L: 12, XL: 5, XXL: 8 });
  assert.deepEqual(await admin.setAllSizes(db.load("anv-1"), () => 0), { ok: true });
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
    await admin.updateProduct(product, { ...kurta, price: 1 }),
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
  const loaded = db.load("anv-1");
  db.gateway.setStock = ((original) => async (request) => {
    db.gateway.setStock = original; // fail once
    return { data: null, error: { message: "TypeError: Failed to fetch" } };
  })(db.gateway.setStock);
  const changed = { ...kurta, price: 3499, sizeStock: { ...kurta.sizeStock, S: 9 } };
  const first = await admin.updateProduct(loaded, changed);
  assert.equal(first.ok, false);
  assert.match(first.error!, /details were saved, but its stock wasn't.*Couldn't reach/);
  assert.deepEqual(await admin.updateProduct(loaded, changed), { ok: true });
  assert.equal(db.products.get("anv-1")?.price, 3499);
  assert.equal(db.stockOf("anv-1").S, 9);
});

test("a stock save whose reply was lost can be retried from the same screen", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const shown = db.load("anv-1"); // S = 1
  assert.deepEqual(await admin.setSizeStock(shown, "S", 4), { ok: true });
  // The reply never arrived, so the dashboard still shows 1; saving 4 again is fine
  assert.deepEqual(await admin.setSizeStock(shown, "S", 4), { ok: true });
  assert.equal(db.stockOf("anv-1").S, 4);
});

// --- Stale saves: stock changed by orders or another admin after the dashboard loaded it ---

test("a stock box saved after a customer bought that size is refused, and the sale stays", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const shown = db.load("anv-1"); // M = 2 on screen
  db.customerBuys("anv-1", "M", 1); // checkout: M = 1
  const result = await admin.setSizeStock(shown, "M", 2); // admin retypes the old number
  assert.equal(result.ok, false);
  assert.deepEqual(result.stockChanged, { M: 1 });
  assert.match(result.error!, /“Placeholder Kurta” changed while you were editing.*size M is now 1 \(you saw 2\).*No stock was saved/);
  assert.equal(db.stockOf("anv-1").M, 1, "the sold piece isn't put back");
  // After reloading, the admin's next save is compared with the live number
  assert.deepEqual(await admin.setSizeStock(db.load("anv-1"), "M", 6), { ok: true });
  assert.equal(db.stockOf("anv-1").M, 6);
});

test("a save after a cancellation or return put stock back is refused too", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const shown = db.load("anv-1"); // XXL = 3
  db.stockReturns("anv-1", "XXL", 2); // a cancelled order: XXL = 5
  const result = await admin.setSizeStock(shown, "XXL", 0);
  assert.equal(result.ok, false);
  assert.deepEqual(result.stockChanged, { XXL: 5 });
  assert.equal(db.stockOf("anv-1").XXL, 5);
});

test("+5 All and Mark Out from old numbers are refused as a whole; no size changes", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const shown = db.load("anv-1");
  db.customerBuys("anv-1", "XXL", 1); // only XXL moved
  const before = db.stockOf("anv-1");
  for (const quantityFor of [(q: number) => q + 5, () => 0]) {
    const result = await admin.setAllSizes(shown, quantityFor);
    assert.equal(result.ok, false);
    assert.equal(result.stockChanged?.XXL, 2);
    assert.match(result.error!, /size XXL is now 2 \(you saw 3\)/);
    assert.doesNotMatch(result.error!, /size S is now/, "only the sizes that moved are named");
    assert.deepEqual(db.stockOf("anv-1"), before, "all or nothing");
  }
});

test("two admins: a save from numbers loaded before the other admin's change is refused", async () => {
  const db = fakeDatabase({ admin: true });
  const first = new CatalogueAdmin(async () => db.gateway);
  const second = new CatalogueAdmin(async () => db.gateway);
  await first.createProduct("anv-1", kurta);
  const firstScreen = db.load("anv-1"); // both see L = 0
  const secondScreen = db.load("anv-1");
  assert.deepEqual(await second.setSizeStock(secondScreen, "L", 8), { ok: true });
  const late = await first.setSizeStock(firstScreen, "L", 3);
  assert.equal(late.ok, false);
  assert.deepEqual(late.stockChanged, { L: 8 });
  assert.equal(db.stockOf("anv-1").L, 8, "the second admin's change stands");
  // The same through the edit form
  const late2 = await first.updateProduct(firstScreen, { ...kurta, sizeStock: { ...kurta.sizeStock, L: 3 } });
  assert.equal(late2.ok, false);
  assert.match(late2.error!, /^The product details were saved, but its stock wasn't\. Stock for .* size L is now 8 \(you saw 0\)/);
  assert.equal(db.stockOf("anv-1").L, 8);
});

test("details-only edits never send stock, even after customers bought pieces", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const shown = db.load("anv-1");
  db.customerBuys("anv-1", "M", 2);
  db.customerBuys("anv-1", "XXL", 1);
  db.stockRequests.length = 0;
  const edits: ProductDraft[] = [
    { ...kurta, description: "New description" },
    { ...kurta, name: "Renamed", price: 3199, salePrice: undefined, isFeatured: true, status: "disabled", subcategory: "Anarkali" },
  ];
  for (const edit of edits) assert.deepEqual(await admin.updateProduct(shown, edit), { ok: true });
  assert.deepEqual(db.stockRequests, [], "no stock request was sent");
  assert.deepEqual(db.stockOf("anv-1"), { S: 1, M: 0, L: 0, XL: 0, XXL: 2 });
  assert.equal(db.products.get("anv-1")?.name, "Renamed");
});

test("an edit sends only the sizes that were changed, with the numbers that were shown", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const shown = db.load("anv-1");
  db.customerBuys("anv-1", "M", 1); // a sale on a size the admin isn't changing
  db.stockRequests.length = 0;
  assert.deepEqual(await admin.updateProduct(shown, { ...kurta, sizeStock: { ...kurta.sizeStock, L: 4 } }), { ok: true });
  assert.deepEqual(db.stockRequests, [{ p_product_id: "anv-1", p_lines: [{ size: "L", quantity: 4, expected: 0 }], p_remove_other_sizes: false }]);
  assert.deepEqual(db.stockOf("anv-1"), { S: 1, M: 1, L: 4, XL: 0, XXL: 3 }, "the sale on M stays");
});

test("switching category saves every new size, removes the old ones, and leaves other products alone", async () => {
  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  await admin.createProduct("anv-2", kurta);
  const other = db.stockOf("anv-2");
  db.stockRequests.length = 0;
  const saree: ProductDraft = { ...kurta, collection: "ayanaa", category: "Sarees", subcategory: "Organza", salePrice: undefined, sizeStock: { "Free Size": 0 } };
  assert.deepEqual(await admin.updateProduct(db.load("anv-1"), saree), { ok: true });
  // Sent even though it is 0, because the size is new
  assert.deepEqual(db.stockRequests, [{ p_product_id: "anv-1", p_lines: [{ size: "Free Size", quantity: 0, expected: 0 }], p_remove_other_sizes: true }]);
  assert.deepEqual(db.stockOf("anv-1"), { "Free Size": 0 });
  assert.deepEqual(db.stockOf("anv-2"), other);
  // And back to a kurta
  const back = await admin.updateProduct(db.load("anv-1"), { ...kurta, sizeStock: { S: 2, M: 0, L: 0, XL: 0, XXL: 0 } });
  assert.deepEqual(back, { ok: true });
  assert.deepEqual(db.stockOf("anv-1"), { S: 2, M: 0, L: 0, XL: 0, XXL: 0 });
});

test("stock replies and errors are reported clearly", async () => {
  assert.deepEqual(parseStockReply({ ok: true, changed: false }), { kind: "saved" });
  assert.deepEqual(parseStockReply({ ok: false, reason: "stock_changed", current: { S: 2, M: -1, L: "x" } }), { kind: "stock_changed", current: { S: 2 } });
  assert.deepEqual(parseStockReply(null), { kind: "refused", reason: "unknown" });
  assert.match(describeWriteError({ code: "55P03", message: "canceling statement due to lock timeout" }), /being changed by an order/);
  assert.match(describeWriteError({ code: "PGRST202", message: "Could not find the function public.admin_set_stock" }), /stock_concurrency_A_function\.sql/);
  assert.match(describeWriteError({ code: "42501", message: "Only admins can change stock." }), /don't have permission/);

  const db = fakeDatabase({ admin: true });
  const admin = new CatalogueAdmin(async () => db.gateway);
  await admin.createProduct("anv-1", kurta);
  const shown = db.load("anv-1");
  db.products.delete("anv-1");
  assert.match((await admin.setSizeStock(shown, "S", 3)).error!, /no longer exists/);
});

test("database error messages", () => {
  assert.match(describeWriteError({ code: "23514", message: "check" }), /rejected these values/);
  assert.match(describeWriteError({ message: "AbortError signal timed out" }), /took too long/);
  assert.match(describeWriteError({ message: "permission denied for table products", code: "42501" }), /permission/);
  assert.match(describeWriteError({ message: "Supabase is not configured" }), /isn't set up/);
});
