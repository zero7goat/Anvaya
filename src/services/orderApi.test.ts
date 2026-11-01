import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CartItem, Product } from "../types";
import {
  OrderApi, describeAdminError, newIdempotencyKey, nextPaymentStatus, nextStatuses, parseOrderRow, parseQuote,
  placeOrderThen, type OrdersGateway, type RpcCustomer, type RpcError, type RpcItem, type RpcResult,
} from "./orderApi.ts";

/**
 * A stand-in for the database functions in supabase/drafts/orders_schema.sql, following
 * their documented contract (prices from the catalogue, stock checked and reserved,
 * the same key replays the same order, a different request with that key is refused,
 * a wrong expected total places nothing). It shows the app uses that contract
 * correctly; it does not prove anything about the live database.
 */
const CATALOGUE: Record<string, { name: string; price: number; stock: Record<string, number> }> = {
  "alk-001": { name: "Turquoise Cotton Floral Kurta", price: 2519, stock: { M: 2 } },
  "ayn-001": { name: "Pastel Organza Saree", price: 3999, stock: { "Free Size": 1 } },
};

type StoredOrder = { key: string; hash: string; summary: Record<string, unknown> };

function fakeDatabase(options: { error?: RpcError; reply?: unknown; admin?: boolean } = {}) {
  const stock = new Map(Object.entries(CATALOGUE).flatMap(([id, p]) => Object.entries(p.stock).map(([s, q]) => [`${id}|${s}`, q])));
  const orders: StoredOrder[] = [];
  const calls: { fn: string; args: unknown }[] = [];
  let sequence = 0;

  const price = (items: RpcItem[], coupon: string | null) => {
    const lines = [];
    const problems = [];
    for (const i of items) {
      const p = CATALOGUE[i.product_id];
      const available = stock.get(`${i.product_id}|${i.size}`) ?? 0;
      if (!p) problems.push({ product_id: i.product_id, name: null, size: i.size, requested: i.quantity, available: null, problem: "not_found" });
      else if (available < i.quantity) problems.push({ product_id: i.product_id, name: p.name, size: i.size, requested: i.quantity, available, problem: "insufficient_stock" });
      else lines.push({ product_id: i.product_id, name: p.name, size: i.size, quantity: i.quantity, unit_price: p.price, line_total: p.price * i.quantity });
    }
    const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
    const discount = coupon === "FESTIVE500" && subtotal >= 4000 ? 500 : 0;
    const shipping = 0;
    return {
      lines, problems, subtotal, discount, coupon_code: discount ? coupon : null,
      coupon_status: coupon ? (discount ? "applied" : "invalid") : "none", minimum_spend: null,
      shipping, total: Math.max(subtotal - discount + shipping, 0),
    };
  };

  const answer = (fn: string, args: unknown, run: () => unknown): Promise<RpcResult> => {
    calls.push({ fn, args });
    if (options.error) return Promise.resolve({ data: null, error: options.error });
    if (options.reply !== undefined) return Promise.resolve({ data: options.reply, error: null });
    return Promise.resolve({ data: run(), error: null });
  };

  const gateway: OrdersGateway = {
    quoteOrder: (args) =>
      answer("quote_order", args, () => {
        if (args.p_items.length === 0) return { ok: false, reason: "invalid_items", message: "Your bag is empty." };
        const quote = price(args.p_items, args.p_coupon_code);
        return { ok: quote.problems.length === 0, reason: quote.problems.length ? "unavailable" : null, quote };
      }),
    placeOrder: (args) =>
      answer("place_order", args, () => {
        if (!/^[6-9]\d{9}$/.test(args.p_customer.phone)) {
          return { ok: false, reason: "invalid_customer", field: "phone", message: "Please enter a valid 10-digit Indian mobile number." };
        }
        const hash = JSON.stringify([args.p_items, args.p_customer, args.p_coupon_code]);
        const existing = orders.find((o) => o.key === args.p_idempotency_key);
        if (existing) {
          return existing.hash === hash
            ? { ok: true, replayed: true, order: existing.summary }
            : { ok: false, reason: "idempotency_conflict", message: "This checkout was already used for a different order. Please review your bag and try again." };
        }
        const quote = price(args.p_items, args.p_coupon_code);
        if (quote.problems.length) return { ok: false, reason: "unavailable", problems: quote.problems, quote };
        if (quote.total !== args.p_expected_total) return { ok: false, reason: "price_changed", quote };
        for (const l of quote.lines) stock.set(`${l.product_id}|${l.size}`, (stock.get(`${l.product_id}|${l.size}`) ?? 0) - l.quantity);
        sequence += 1;
        const summary = {
          reference: `ANV-${String(sequence).padStart(10, "0")}`,
          created_at: "2026-10-29T06:30:00+00:00",
          status: "Pending", payment_method: "COD", payment_status: "COD - Due",
          customer: { ...args.p_customer, email: args.p_customer.email ?? null },
          items: quote.lines.map((l) => ({ ...l })),
          subtotal: quote.subtotal, discount: quote.discount, coupon_code: quote.coupon_code, shipping: quote.shipping, total: quote.total,
        };
        orders.push({ key: args.p_idempotency_key, hash, summary });
        return { ok: true, replayed: false, order: summary };
      }),
    updateOrderStatus: (args) =>
      answer("admin_update_order_status", args, () => {
        if (!options.admin) throw new Error("unreachable: non-admins get an error below");
        if (args.p_status === "Shipped") return { ok: false, reason: "invalid_transition", message: "An order that is Pending can't be changed to Shipped." };
        return { ok: true, changed: true, status: args.p_status ?? "Pending", payment_status: args.p_payment_status ?? "COD - Due" };
      }),
    selectOrders: (limit) => answer("select orders", { limit }, () => (options.admin ? [ADMIN_ROW] : [])),
  };
  if (options.admin === false) {
    gateway.updateOrderStatus = (args) => {
      calls.push({ fn: "admin_update_order_status", args });
      return Promise.resolve({ data: null, error: { code: "42501", message: "Only admins can update orders." } });
    };
  }
  return { api: new OrderApi(async () => gateway), calls, stock, orders };
}

const product = (id: string): Product => ({
  id,
  name: "Browser copy of the name",
  description: "",
  collection: id.startsWith("alk") ? "alankritha" : "ayanaa",
  category: id.startsWith("alk") ? "Kurtas" : "Sarees",
  price: 1, // deliberately wrong: the database's price must win
  image: "",
  sizeStock: {},
  reviews: [],
  isFeatured: false,
  isNewArrival: false,
  status: "enabled",
});
const line = (id: string, size: string, quantity: number): CartItem => ({ product: product(id), selectedSize: size, quantity });

const CUSTOMER: RpcCustomer = { name: "Test Shopper", phone: "9876543210", address: "1 Test Street", city: "Ballari", state: "Karnataka", pincode: "583101" };
const KEY = "0b7c1f7e-2a6d-4c35-9a51-7d4f0c3e9b21";

const ADMIN_ROW = {
  id: "5b0a6c4e-1f2d-4e3a-8b9c-0d1e2f3a4b5c",
  reference: "ANV-0000000001",
  created_at: "2026-10-29T18:45:00+00:00",
  status: "Pending",
  payment_method: "COD",
  payment_status: "COD - Due",
  customer_name: "Test Shopper",
  customer_phone: "9876543210",
  customer_email: null,
  address: "1 Test Street",
  city: "Ballari",
  state: "Karnataka",
  pincode: "583101",
  subtotal: 2519,
  discount: 0,
  coupon_code: null,
  shipping: 0,
  total: 2519,
  order_items: [{ product_id: "alk-001", product_name: "Turquoise Cotton Floral Kurta", size: "M", unit_price: 2519, quantity: 1, line_total: 2519 }],
};

test("a quote uses the database's prices and shipping, not the browser's", async () => {
  const { api, calls } = fakeDatabase();
  const result = await api.quote([line("alk-001", "M", 1)]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.subtotal, 2519);
  assert.equal(result.quote.shipping, 0);
  assert.equal(result.quote.total, 2519);
  assert.deepEqual(calls[0], { fn: "quote_order", args: { p_items: [{ product_id: "alk-001", size: "M", quantity: 1 }], p_coupon_code: null } });
});

test("a quote reports pieces that are no longer in stock", async () => {
  const { api } = fakeDatabase();
  const result = await api.quote([line("alk-001", "M", 3)]);
  assert.equal(result.ok, false);
  if (result.ok || result.kind !== "unavailable") return assert.fail("expected unavailable");
  assert.deepEqual(result.quote.problems.map((p) => [p.problem, p.available]), [["insufficient_stock", 2]]);
});

test("successful checkout: the exact place_order contract, and the database's order comes back", async () => {
  const { api, calls, stock } = fakeDatabase();
  const cart = [line("alk-001", "M", 1)];
  const result = await api.placeOrder({ idempotencyKey: KEY, cart, customer: CUSTOMER, couponCode: " ", expectedTotal: 2519 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(calls[0], {
    fn: "place_order",
    args: { p_idempotency_key: KEY, p_items: [{ product_id: "alk-001", size: "M", quantity: 1 }], p_customer: CUSTOMER, p_coupon_code: null, p_expected_total: 2519 },
  });
  assert.equal(result.order.reference, "ANV-0000000001");
  assert.equal(result.order.id, result.order.reference);
  assert.equal(result.order.items[0].name, "Turquoise Cotton Floral Kurta", "the database's name, not the browser's");
  assert.equal(result.order.items[0].price, 2519, "the database's price, not the browser's");
  assert.equal(result.order.total, 2519);
  assert.equal(result.order.date, "2026-10-29");
  assert.equal(result.order.time, "12:00", "shown in India time");
  assert.equal(result.replayed, false);
  assert.equal(stock.get("alk-001|M"), 1, "stock is reserved by the database");
});

test("an empty bag never reaches the database", async () => {
  const { api, calls } = fakeDatabase();
  const result = await api.placeOrder({ idempotencyKey: KEY, cart: [], customer: CUSTOMER, expectedTotal: 0 });
  assert.deepEqual([result.ok, !result.ok && result.kind], [false, "invalid_items"]);
  assert.equal((await api.quote([])).ok, false);
  assert.equal(calls.length, 0);
});

test("an invalid expected total or key is refused before calling the database", async () => {
  const { api, calls } = fakeDatabase();
  const cart = [line("alk-001", "M", 1)];
  for (const expectedTotal of [-1, 25.5, Number.NaN]) {
    const result = await api.placeOrder({ idempotencyKey: KEY, cart, customer: CUSTOMER, expectedTotal });
    assert.equal(result.ok, false, String(expectedTotal));
  }
  assert.equal((await api.placeOrder({ idempotencyKey: "not-a-uuid", cart, customer: CUSTOMER, expectedTotal: 2519 })).ok, false);
  assert.equal(calls.length, 0);
});

test("a changed total places nothing and returns the database's new quote", async () => {
  const { api, stock, orders } = fakeDatabase();
  const result = await api.placeOrder({ idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: CUSTOMER, expectedTotal: 1999 });
  assert.equal(result.ok, false);
  if (result.ok || result.kind !== "price_changed") return assert.fail("expected price_changed");
  assert.equal(result.quote.total, 2519);
  assert.match(result.message, /₹2,519/);
  assert.equal(orders.length, 0);
  assert.equal(stock.get("alk-001|M"), 2);
});

test("not enough stock places nothing", async () => {
  const { api, orders } = fakeDatabase();
  const result = await api.placeOrder({ idempotencyKey: KEY, cart: [line("ayn-001", "Free Size", 2)], customer: CUSTOMER, expectedTotal: 7998 });
  assert.equal(result.ok, false);
  if (result.ok || result.kind !== "unavailable") return assert.fail("expected unavailable");
  assert.equal(result.quote?.problems[0].problem, "insufficient_stock");
  assert.equal(orders.length, 0);
});

test("a duplicate submission with the same key returns the same order, once", async () => {
  const { api, orders, stock } = fakeDatabase();
  const request = { idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: CUSTOMER, expectedTotal: 2519 };
  const [first, second] = await Promise.all([api.placeOrder(request), api.placeOrder(request)]);
  assert.ok(first.ok && second.ok);
  assert.equal(first.order.reference, second.order.reference);
  assert.deepEqual([first.replayed, second.replayed], [false, true]);
  assert.equal(orders.length, 1);
  assert.equal(stock.get("alk-001|M"), 1, "stock is taken once");
});

test("the same key with different details is refused", async () => {
  const { api } = fakeDatabase();
  await api.placeOrder({ idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: CUSTOMER, expectedTotal: 2519 });
  const result = await api.placeOrder({ idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: { ...CUSTOMER, city: "Hosapete" }, expectedTotal: 2519 });
  assert.deepEqual([result.ok, !result.ok && result.kind], [false, "idempotency_conflict"]);
});

test("customer details the database refuses point at the field", async () => {
  const { api } = fakeDatabase();
  const result = await api.placeOrder({ idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: { ...CUSTOMER, phone: "12345" }, expectedTotal: 2519 });
  assert.equal(result.ok, false);
  if (result.ok || result.kind !== "invalid_customer") return assert.fail("expected invalid_customer");
  assert.equal(result.field, "phone");
});

test("database errors: rolled back, not set up, or unknown (retry is safe)", async () => {
  const request = { idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: CUSTOMER, expectedTotal: 2519 };
  const kindFor = async (error: RpcError) => {
    const result = await fakeDatabase({ error }).api.placeOrder(request);
    return result.ok ? "ok" : result.kind;
  };
  assert.equal(await kindFor({ code: "57014", message: "canceling statement due to statement timeout" }), "failed");
  assert.equal(await kindFor({ code: "55P03", message: "lock not available" }), "failed");
  assert.equal(await kindFor({ code: "PGRST202", message: "Could not find the function public.place_order" }), "not_set_up");
  assert.equal(await kindFor({ code: "P0001", message: "Checkout is unavailable: the shop settings are missing." }), "not_set_up");
  assert.equal(await kindFor({ message: "Supabase is not configured" }), "not_set_up");
  assert.equal(await kindFor({ code: "", message: "TypeError: Failed to fetch" }), "uncertain");
  assert.equal(await kindFor({ message: "AbortError: signal timed out" }), "uncertain");
});

test("a 'saved' reply whose totals don't add up is never shown as a placed order", async () => {
  const bad = {
    ok: true, replayed: false,
    order: {
      reference: "ANV-0000000009", created_at: "2026-10-29T06:30:00+00:00", status: "Pending", payment_method: "COD", payment_status: "COD - Due",
      customer: CUSTOMER, items: [{ product_id: "alk-001", name: "Kurta", size: "M", quantity: 1, unit_price: 2519, line_total: 2519 }],
      subtotal: 2519, discount: 0, coupon_code: null, shipping: 0, total: 99,
    },
  };
  const result = await fakeDatabase({ reply: bad }).api.placeOrder({ idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: CUSTOMER, expectedTotal: 2519 });
  assert.deepEqual([result.ok, !result.ok && result.kind], [false, "uncertain"]);
  assert.equal((await fakeDatabase({ reply: { ok: true } }).api.placeOrder({ idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: CUSTOMER, expectedTotal: 2519 })).ok, false);
});

test("quotes that don't add up are rejected", () => {
  const good = { lines: [{ product_id: "a", name: "A", size: "M", quantity: 2, unit_price: 500, line_total: 1000 }], problems: [], subtotal: 1000, discount: 0, coupon_code: null, coupon_status: "none", shipping: 99, total: 1099 };
  assert.ok(parseQuote(good));
  assert.equal(parseQuote({ ...good, total: 1000 }), null, "total must be subtotal - discount + shipping");
  assert.equal(parseQuote({ ...good, subtotal: 900 }), null, "subtotal must be the sum of the lines");
  assert.equal(parseQuote({ ...good, discount: 1200 }), null, "discount can't exceed the subtotal");
  assert.equal(parseQuote({ ...good, lines: [{ ...good.lines[0], line_total: 999 }] }), null);
  assert.equal(parseQuote({ ...good, discount: 100, total: 999 }), null, "a discount needs its coupon code");
  assert.equal(parseQuote(null), null);
});

test("WhatsApp is opened only after the database confirms the order", async () => {
  const events: string[] = [];
  const opened: string[] = [];
  const request = { idempotencyKey: KEY, cart: [line("alk-001", "M", 1)], customer: CUSTOMER, expectedTotal: 2519 };
  const open = (order: { reference: string }) => {
    events.push("whatsapp");
    opened.push(order.reference);
  };

  for (const failing of [
    fakeDatabase({ error: { code: "", message: "TypeError: Failed to fetch" } }),
    fakeDatabase({ error: { code: "PGRST202", message: "missing" } }),
    fakeDatabase({ reply: { ok: false, reason: "unavailable", quote: null } }),
    fakeDatabase({ reply: { ok: true, order: { reference: "ANV-0000000001" } } }), // malformed "success"
  ]) {
    const result = await placeOrderThen(failing.api, request, open);
    assert.equal(result.ok, false);
  }
  assert.deepEqual(opened, [], "no failure ever opens WhatsApp");

  const db = fakeDatabase();
  const gateway = await (db.api as unknown as { gateway: () => Promise<OrdersGateway> }).gateway();
  const placeOrder = gateway.placeOrder;
  gateway.placeOrder = async (args) => {
    const reply = await placeOrder(args);
    events.push("saved");
    return reply;
  };
  const result = await placeOrderThen(new OrderApi(async () => gateway), request, open);
  assert.equal(result.ok, true);
  assert.deepEqual(events, ["saved", "whatsapp"]);
  assert.deepEqual(opened, ["ANV-0000000001"]);
});

test("admins read real orders with their items, in India time", async () => {
  const result = await fakeDatabase({ admin: true }).api.listOrders();
  assert.ok(result.ok);
  assert.equal(result.orders.length, 1);
  const [order] = result.orders;
  assert.equal(order.id, ADMIN_ROW.id, "the row id is kept for status changes");
  assert.equal(order.reference, "ANV-0000000001");
  assert.deepEqual([order.date, order.time], ["2026-10-30", "00:15"]);
  assert.equal(order.items[0].name, "Turquoise Cotton Floral Kurta");
  assert.equal(order.customerEmail, "");
  assert.equal(result.skipped, 0);
});

test("non-admins see no orders, and rows that don't add up are skipped", async () => {
  const none = await fakeDatabase({ admin: false }).api.listOrders();
  assert.deepEqual(none, { ok: true, orders: [], skipped: 0 });
  assert.equal(parseOrderRow({ ...ADMIN_ROW, total: 1 }), null);
  assert.equal(parseOrderRow({ ...ADMIN_ROW, status: "Lost" }), null);
  assert.equal(parseOrderRow({ ...ADMIN_ROW, order_items: [] }), null);
  assert.ok(parseOrderRow({ ...ADMIN_ROW, order_items: [{ ...ADMIN_ROW.order_items[0], product_id: null }] }), "a deleted product's line is kept");
});

test("status updates call admin_update_order_status with its exact arguments", async () => {
  const { api, calls } = fakeDatabase({ admin: true });
  const result = await api.updateStatus(ADMIN_ROW.id, { status: "Confirmed" });
  assert.deepEqual(result, { ok: true, changed: true, status: "Confirmed", paymentStatus: "COD - Due" });
  assert.deepEqual(calls[0], { fn: "admin_update_order_status", args: { p_order_id: ADMIN_ROW.id, p_status: "Confirmed", p_payment_status: null } });

  await api.updateStatus(ADMIN_ROW.id, { paymentStatus: "Paid" });
  assert.deepEqual(calls[1].args, { p_order_id: ADMIN_ROW.id, p_status: null, p_payment_status: "Paid" });

  const refused = await api.updateStatus(ADMIN_ROW.id, { status: "Shipped" });
  assert.deepEqual(refused, { ok: false, error: "An order that is Pending can't be changed to Shipped." });
  assert.equal((await api.updateStatus(ADMIN_ROW.id, {})).ok, false);
});

test("a non-admin's status change is refused by the database", async () => {
  const result = await fakeDatabase({ admin: false }).api.updateStatus(ADMIN_ROW.id, { status: "Confirmed" });
  assert.deepEqual(result, { ok: false, error: "You don't have permission to manage orders. Sign in again as an admin." });
  assert.match(describeAdminError({ code: "PGRST205", message: "Could not find the table" }, "read"), /aren't set up/);
});

test("status and payment options follow the database's rules", () => {
  assert.deepEqual(nextStatuses("Pending"), ["Confirmed", "Cancelled"]);
  assert.deepEqual(nextStatuses("Shipped"), ["Delivered", "Returned"]);
  assert.deepEqual(nextStatuses("Cancelled"), []);
  assert.equal(nextPaymentStatus({ status: "Pending", paymentStatus: "COD - Due" }), null);
  assert.equal(nextPaymentStatus({ status: "Delivered", paymentStatus: "COD - Due" }), "Paid");
  assert.equal(nextPaymentStatus({ status: "Returned", paymentStatus: "Paid" }), "Refunded");
  assert.equal(nextPaymentStatus({ status: "Delivered", paymentStatus: "Paid" }), null);
});

test("each checkout attempt gets a fresh random key", () => {
  const a = newIdempotencyKey();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, newIdempotencyKey());
});

