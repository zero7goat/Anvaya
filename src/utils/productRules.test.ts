import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProductForm, checkStockQuantity, isAllowedImage, newProductId, type ProductFormValues } from "./productRules.ts";

const kurtaForm = (changes: Partial<ProductFormValues> = {}): ProductFormValues => ({
  name: " Placeholder Kurta ",
  description: "Placeholder description",
  collection: "alankritha",
  category: "Kurtas",
  subcategory: "A-Line",
  price: "2999",
  salePrice: "",
  image: "https://example.com/kurta.jpg",
  isFeatured: false,
  isNewArrival: true,
  status: "enabled",
  sizeStock: { S: 1, M: "2", L: 0, XL: 0, XXL: 3, "Free Size": 9 },
  ...changes,
});

const errorOf = (form: ProductFormValues) => {
  const result = checkProductForm(form);
  assert.equal(result.ok, false);
  return result.error;
};

test("a valid kurta becomes a draft with exactly the kurta sizes", () => {
  const result = checkProductForm(kurtaForm());
  assert.equal(result.ok, true);
  assert.equal(result.value!.name, "Placeholder Kurta");
  assert.deepEqual(result.value!.sizeStock, { S: 1, M: 2, L: 0, XL: 0, XXL: 3 });
  assert.equal(result.value!.salePrice, undefined);
});

test("a saree is Free Size only", () => {
  const result = checkProductForm(
    kurtaForm({ collection: "ayanaa", category: "Sarees", subcategory: "Organza", sizeStock: { "Free Size": 4, M: 2 } })
  );
  assert.deepEqual(result.value!.sizeStock, { "Free Size": 4 });
});

test("collections stay kurtas-only and sarees-only", () => {
  assert.match(errorOf(kurtaForm({ collection: "ayanaa" })), /Alankritha is for kurtas/);
  assert.match(errorOf(kurtaForm({ category: "Co-ord Sets" })), /Kurtas \(Alankritha\) or Sarees/);
  assert.match(errorOf(kurtaForm({ subcategory: "Organza" })), /style from the Alankritha list/);
});

test("required fields and length limits", () => {
  assert.match(errorOf(kurtaForm({ name: "   " })), /product name/);
  assert.match(errorOf(kurtaForm({ description: "" })), /description/);
  assert.match(errorOf(kurtaForm({ name: "x".repeat(121) })), /under 120/);
});

test("prices are whole rupees and the sale price must be lower", () => {
  assert.match(errorOf(kurtaForm({ price: "0" })), /more than 0/);
  assert.match(errorOf(kurtaForm({ price: "12.50" })), /whole rupees/);
  assert.match(errorOf(kurtaForm({ price: "-5" })), /whole rupees/);
  assert.match(errorOf(kurtaForm({ price: "99999999" })), /too high/);
  assert.match(errorOf(kurtaForm({ salePrice: "2999" })), /lower than the price/);
  assert.match(errorOf(kurtaForm({ salePrice: "abc" })), /sale price/);
  assert.equal(checkProductForm(kurtaForm({ salePrice: "1999" })).value!.salePrice, 1999);
});

test("stock is a whole number from 0 to 9999", () => {
  assert.match(errorOf(kurtaForm({ sizeStock: { S: -1, M: 0, L: 0, XL: 0, XXL: 0 } })), /Size S: Stock must be a whole number/);
  assert.match(errorOf(kurtaForm({ sizeStock: { S: "1.5", M: 0, L: 0, XL: 0, XXL: 0 } })), /whole number/);
  assert.equal(checkStockQuantity("10000").ok, false);
  assert.deepEqual(checkStockQuantity(" 7 "), { ok: true, value: 7 });
  assert.equal(checkStockQuantity("").ok, false);
});

test("images: optional, https or a site file only", () => {
  assert.equal(isAllowedImage(""), true);
  assert.equal(isAllowedImage("/images/products/alk-001-front.jpg"), true);
  assert.equal(isAllowedImage("https://cdn.example.com/a.jpg"), true);
  assert.equal(isAllowedImage("http://example.com/a.jpg"), false);
  assert.equal(isAllowedImage("javascript:alert(1)"), false);
  assert.equal(isAllowedImage("/images/../secret"), false);
  assert.equal(isAllowedImage("data:image/png;base64,AAAA"), false);
  assert.match(errorOf(kurtaForm({ image: "ftp://example.com/a.jpg" })), /https:\/\//);
});

test("new product ids are unique", () => {
  const ids = new Set(Array.from({ length: 200 }, newProductId));
  assert.equal(ids.size, 200);
  assert.match([...ids][0], /^anv-[a-z0-9]+-[a-z0-9]+$/);
});
