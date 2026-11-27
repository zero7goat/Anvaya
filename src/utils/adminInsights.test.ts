import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order, Product } from "../types";
import {
  couponUsage, customerPhoneHref, customerWhatsAppUrl, lowStockSizes, orderPaymentLabel, orderStatusCounts,
  ordersNeedingAttention, salesSummary,
} from "./adminInsights.ts";

const order = (over: Partial<Order>): Order =>
  ({
    id: "o", reference: "ANV-0000000001", createdAt: "2026-11-20T06:00:00Z", status: "Pending",
    paymentMethod: "COD", paymentStatus: "COD - Due", total: 1000, customerName: "Priya", customerPhone: "9876543210",
    ...over,
  }) as Order;

test("payment labels say how each order is being paid", () => {
  assert.deepEqual(orderPaymentLabel({ paymentMethod: "Razorpay", paymentStatus: "Paid" }), { label: "Paid online", tone: "success" });
  assert.equal(orderPaymentLabel({ paymentMethod: "Razorpay", paymentStatus: "Awaiting payment" }).label, "Awaiting payment");
  assert.equal(orderPaymentLabel({ paymentMethod: "Razorpay", paymentStatus: "Refund Pending" }).label, "Refund pending");
  assert.equal(orderPaymentLabel({ paymentMethod: "COD", paymentStatus: "COD - Due" }).label, "COD due");
  assert.equal(orderPaymentLabel({ paymentMethod: "COD", paymentStatus: "Paid" }).label, "Paid (COD)");
});

test("status counts include every status, even at zero", () => {
  const counts = orderStatusCounts([order({ status: "Pending" }), order({ status: "Pending" }), order({ status: "Shipped" })]);
  assert.equal(counts.Pending, 2);
  assert.equal(counts.Shipped, 1);
  assert.equal(counts.Returned, 0);
});

test("sales leave out cancelled, returned and unpaid online orders, and use India's month", () => {
  const now = new Date("2026-11-27T06:00:00Z");
  const orders = [
    order({ createdAt: "2026-11-26T06:00:00Z", total: 1500 }), // this week and month
    order({ createdAt: "2026-11-05T06:00:00Z", total: 2000 }), // this month only
    order({ createdAt: "2026-10-31T19:00:00Z", total: 700 }), // 1 Nov 00:30 in India: this month
    order({ createdAt: "2026-10-31T18:00:00Z", total: 900 }), // 31 Oct 23:30 in India: last month
    order({ createdAt: "2026-11-26T06:00:00Z", total: 5000, status: "Cancelled" }),
    order({ createdAt: "2026-11-26T06:00:00Z", total: 4000, paymentMethod: "Razorpay", paymentStatus: "Awaiting payment" }),
  ];
  const { week, month } = salesSummary(orders, now);
  assert.deepEqual(week, { count: 1, total: 1500 });
  assert.deepEqual(month, { count: 3, total: 4200 });
});

test("low stock lists sizes at or under the threshold, sold out first", () => {
  const kurta = { id: "k", name: "Kurta", category: "Kurtas", sizeStock: { S: 0, M: 1, L: 5, XL: 2, XXL: 0 } } as unknown as Product;
  const saree = { id: "s", name: "Saree", category: "Sarees", sizeStock: { "Free Size": 1 } } as unknown as Product;
  const rows = lowStockSizes([kurta, saree]).map((r) => `${r.product.id}:${r.size}:${r.quantity}`);
  assert.deepEqual(rows, ["k:S:0", "k:XXL:0", "k:M:1", "s:Free Size:1"]);
});

test("attention counts: paid orders to confirm, unpaid holds, orders to ship and refunds owed", () => {
  const counts = ordersNeedingAttention([
    order({ status: "Pending" }),
    order({ status: "Pending", paymentMethod: "Razorpay", paymentStatus: "Paid" }),
    order({ status: "Pending", paymentMethod: "Razorpay", paymentStatus: "Awaiting payment" }),
    order({ status: "Confirmed" }),
    order({ status: "Cancelled", paymentMethod: "Razorpay", paymentStatus: "Paid" }),
    order({ status: "Cancelled", paymentMethod: "Razorpay", paymentStatus: "Refunded" }),
  ]);
  assert.deepEqual(counts, { toConfirm: 2, awaitingPayment: 1, toShip: 1, toRefund: 1 });
});

test("coupon usage counts live orders per code", () => {
  const usage = couponUsage([
    order({ couponCode: "anvaya10" }),
    order({ couponCode: "ANVAYA10" }),
    order({ couponCode: "ANVAYA10", status: "Cancelled" }),
    order({}),
  ]);
  assert.deepEqual(usage, { ANVAYA10: 2 });
});

test("customer contact links use the Indian mobile number", () => {
  const o = order({ customerPhone: "98765 43210", customerName: "Priya", reference: "ANV-0000000001" });
  const url = new URL(customerWhatsAppUrl(o, "ANVAYA"));
  assert.equal(url.host + url.pathname, "wa.me/919876543210");
  assert.match(url.searchParams.get("text") ?? "", /ANV-0000000001/);
  assert.equal(customerPhoneHref(o), "tel:+919876543210");
});
