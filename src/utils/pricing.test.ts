import { test } from "node:test";
import assert from "node:assert/strict";
import type { CartItem, Offer, Product } from "../types";
import { calculateCartTotals, getOfferDiscount, getOfferIneligibility, getShipping } from "./pricing.ts";

const RULES = { freeShippingThreshold: 1999, standardShippingFee: 99 };

const product = (price: number, salePrice?: number): Product =>
  ({ id: `p-${price}`, name: "Piece", price, salePrice, sizeStock: { M: 5 }, status: "enabled" }) as unknown as Product;
const line = (p: Product, quantity: number): CartItem => ({ product: p, selectedSize: "M", quantity });

const PERCENT: Offer = { id: "o1", title: "", code: "ALANKRITHA10", discountValue: 10, type: "percent", enabled: true, minSpend: 1500 };
const FLAT: Offer = { id: "o2", title: "", code: "FESTIVE500", discountValue: 500, type: "flat", enabled: true, minSpend: 4000 };

test("sale price is charged when set", () => {
  const totals = calculateCartTotals([line(product(3599, 2519), 2)], null, RULES);
  assert.equal(totals.subtotal, 5038);
});

test("shipping is free at the threshold and charged just below it", () => {
  assert.equal(getShipping(1999, RULES), 0);
  assert.equal(getShipping(1998, RULES), 99);
  assert.equal(getShipping(0, RULES), 0);
});

test("percent coupon applies above its minimum spend, rounded to whole rupees", () => {
  assert.equal(getOfferDiscount(PERCENT, 2519), 252);
  assert.equal(getOfferDiscount(PERCENT, 1499), 0);
  assert.match(getOfferIneligibility(PERCENT, 1499) ?? "", /minimum spend of ₹1,500/);
});

test("coupon stops applying when the cart drops below its minimum", () => {
  const big = calculateCartTotals([line(product(2000), 2)], FLAT, RULES);
  assert.equal(big.discount, 500);
  assert.equal(big.appliedOffer?.code, "FESTIVE500");
  const small = calculateCartTotals([line(product(2000), 1)], FLAT, RULES);
  assert.equal(small.discount, 0);
  assert.equal(small.appliedOffer, null);
});

test("disabled coupons never apply", () => {
  assert.equal(getOfferDiscount({ ...PERCENT, enabled: false }, 5000), 0);
});

test("a flat discount can never exceed the subtotal", () => {
  assert.equal(getOfferDiscount({ ...FLAT, minSpend: 0 }, 300), 300);
});

test("total = subtotal - discount + shipping, and free-shipping gap is reported", () => {
  const totals = calculateCartTotals([line(product(1839), 1)], PERCENT, RULES);
  assert.equal(totals.discount, 184);
  assert.equal(totals.shipping, 99);
  assert.equal(totals.total, 1839 - 184 + 99);
  assert.equal(totals.amountToFreeShipping, 160);
});

test("an empty cart costs nothing", () => {
  const totals = calculateCartTotals([], PERCENT, RULES);
  assert.deepEqual([totals.subtotal, totals.discount, totals.shipping, totals.total], [0, 0, 0, 0]);
});
