import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderEnquiry } from "./whatsappEnquiry.ts";
import type { CartItem } from "../types.ts";

const item = (changes: Partial<CartItem["product"]> = {}, quantity = 2): CartItem => ({
  product: { id: "alk-001", name: "Rose Kurta", price: 2000, ...changes } as CartItem["product"],
  selectedSize: "M",
  quantity,
});

test("the enquiry lists each piece and the bag's figures, and asks for what the boutique needs", () => {
  const message = buildOrderEnquiry({ brandName: "ANVAYA", items: [item({ salePrice: 1500 })], subtotal: 3000, total: 3000 });
  assert.match(message, /\*Rose Kurta\*\n {3}Code: ALK-001 \| Size: M \| Qty: 2 \| ₹3,000/);
  assert.match(message, /Shipping: Free/);
  assert.match(message, /\*Total: ₹3,000\*/);
  assert.match(message, /My name:\nDelivery address with PIN code:$/);
  assert.doesNotMatch(message, /Coupon|Cash on Delivery|COD/);
});

test("a coupon appears only when it applies", () => {
  const message = buildOrderEnquiry({ brandName: "ANVAYA", items: [item()], subtotal: 1000, discount: 100, couponCode: "DIWALI10", total: 900 });
  assert.match(message, /Coupon DIWALI10: -₹100/);
});
