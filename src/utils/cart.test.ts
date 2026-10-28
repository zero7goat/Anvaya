import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "../types";
import { addCartItem, reconcileCart, removeCartItem, setCartItemQuantity, toStoredCart } from "./cart.ts";

const kurta = (stock: Record<string, number>, extra: Partial<Product> = {}): Product =>
  ({ id: "alk-001", name: "Kurta", price: 3599, salePrice: 2519, sizeStock: stock, status: "enabled", ...extra }) as unknown as Product;

test("adding the same size twice merges the line and caps it at stock", () => {
  const p = kurta({ M: 3 });
  let cart = addCartItem([], p, "M", 2);
  cart = addCartItem(cart, p, "M", 2);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
});

test("adding never edits the previous cart (safe when React runs updates twice)", () => {
  const p = kurta({ M: 5 });
  const first = addCartItem([], p, "M", 1);
  const snapshot = JSON.stringify(first);
  const second = addCartItem(first, p, "M", 1);
  assert.equal(JSON.stringify(first), snapshot);
  assert.equal(second[0].quantity, 2);
  // Running the same update twice from the same state gives the same result
  assert.equal(addCartItem(first, p, "M", 1)[0].quantity, 2);
});

test("sold-out sizes and zero quantities are not added", () => {
  const p = kurta({ M: 2, XXL: 0 });
  assert.equal(addCartItem([], p, "XXL", 1).length, 0);
  assert.equal(addCartItem([], p, "M", 0).length, 0);
});

test("different sizes of one piece are separate lines", () => {
  const p = kurta({ M: 2, L: 2 });
  const cart = addCartItem(addCartItem([], p, "M", 1), p, "L", 1);
  assert.equal(cart.length, 2);
  assert.deepEqual(removeCartItem(cart, p.id, "M").map((i) => i.selectedSize), ["L"]);
});

test("quantity changes stay between 1 and the stock left", () => {
  const p = kurta({ M: 3 });
  const cart = addCartItem([], p, "M", 1);
  assert.equal(setCartItemQuantity(cart, p, "M", 10)[0].quantity, 3);
  assert.equal(setCartItemQuantity(cart, p, "M", 0)[0].quantity, 1);
});

test("a saved cart is rebuilt against live stock and catalogue", () => {
  const live = kurta({ M: 1, L: 4 });
  const hidden = kurta({ M: 5 }, { id: "alk-002", status: "disabled" } as Partial<Product>);
  const lines = [
    { productId: "alk-001", size: "M", quantity: 3 }, // capped to 1
    { productId: "alk-001", size: "XL", quantity: 1 }, // no stock in that size: dropped
    { productId: "alk-002", size: "M", quantity: 1 }, // hidden product: dropped
    { productId: "gone", size: "M", quantity: 1 }, // removed product: dropped
    { productId: "alk-001", size: "M", quantity: 1 }, // duplicate line: dropped
    { productId: "alk-001", size: "L", quantity: "2" as unknown as number }, // tolerant of bad data
  ];
  const cart = reconcileCart(lines, [live, hidden]);
  assert.deepEqual(
    cart.map((i) => [i.selectedSize, i.quantity]),
    [["M", 1], ["L", 2]]
  );
  assert.equal(cart[0].product, live);
});

test("only ids, sizes and quantities are stored", () => {
  const cart = addCartItem([], kurta({ M: 2 }), "M", 1);
  assert.deepEqual(toStoredCart(cart), [{ productId: "alk-001", size: "M", quantity: 1 }]);
});
