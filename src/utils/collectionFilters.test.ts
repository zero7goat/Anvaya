import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "../types.ts";
import {
  NO_FILTERS, applyCollectionFilters, countActiveFilters, discountOf, getFilterOptions, getProductColors,
  getProductFabrics, priceOf, type CollectionFilters,
} from "./collectionFilters.ts";

const KURTA_STYLES = ["Straight Fit", "A-Line", "Anarkali"];
const SAREE_STYLES = ["Banarasi Silk", "Organza", "Katan Silk"];

const product = (id: string, changes: Partial<Product>): Product => ({
  id,
  name: "Placeholder",
  description: "",
  collection: "alankritha",
  category: "Kurtas",
  subcategory: "Straight Fit",
  price: 3000,
  image: "",
  sizeStock: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
  reviews: [],
  isFeatured: false,
  isNewArrival: false,
  status: "enabled",
  ...changes,
});

const kurtas = [
  product("k1", { name: "Turquoise Cotton Floral Straight Kurta", price: 3599, salePrice: 2519, sizeStock: { S: 2, M: 0, L: 1, XL: 0, XXL: 0 } }),
  product("k2", { name: "Red Embroidered Art Silk Festive Kurta", price: 5995, salePrice: 3597, sizeStock: { S: 0, M: 3, L: 0, XL: 0, XXL: 0 } }),
  product("k3", { name: "Mustard Yellow Silk Chanderi Kurta", subcategory: "A-Line", price: 4299, salePrice: 3499, sizeStock: { S: 0, M: 1, L: 0, XL: 2, XXL: 0 } }),
  product("k4", { name: "Coral Red Flared Kurta", subcategory: "Anarkali", price: 5499, sizeStock: { S: 0, M: 0, L: 0, XL: 0, XXL: 4 } }),
  product("k5", { name: "Printed Short Kurta", subcategory: "A-Line", price: 2299, salePrice: 1839 }), // no colour or fabric named, no stock
];

const sarees = [
  product("s1", { name: "Pastel Sage Green Hand-Painted Organza Saree", collection: "ayanaa", category: "Sarees", subcategory: "Organza", price: 4899, salePrice: 3999, sizeStock: { "Free Size": 3 } }),
  product("s2", { name: "Royal Mayura Banarasi Katan Silk Saree", collection: "ayanaa", category: "Sarees", subcategory: "Banarasi Silk", price: 8999, salePrice: 7499, sizeStock: { "Free Size": 2 } }),
  product("s3", { name: "Tangerine and Red Ombré Bandhani Saree", collection: "ayanaa", category: "Sarees", subcategory: "Organza", price: 4499, salePrice: 3599, sizeStock: { "Free Size": 1 } }),
];

const ids = (list: Product[]) => list.map((p) => p.id);
const filters = (changes: Partial<CollectionFilters>): CollectionFilters => ({ ...NO_FILTERS, ...changes });

test("colours come from words in the name, grouped into families", () => {
  assert.deepEqual(getProductColors(kurtas[0]), ["Blue"]);
  assert.deepEqual(getProductColors(kurtas[2]), ["Yellow"]);
  assert.deepEqual(getProductColors(sarees[2]), ["Red", "Orange"]);
  assert.deepEqual(getProductColors(kurtas[4]), [], "a name with no colour gives no colour");
  assert.deepEqual(getProductColors(product("x", { name: "Gold-trimmed Kurta" })), ["Gold"]);
  assert.deepEqual(getProductColors(product("x", { name: "Tanned Peachy Kurta" })), [], "only whole words count");
});

test("the description never adds a colour or fabric", () => {
  const p = product("x", { name: "Printed Kurta", description: "Cotton kurta with gold zari and red trim" });
  assert.deepEqual(getProductColors(p), []);
  assert.deepEqual(getProductFabrics(p), []);
});

test("fabrics come from the name, and art silk is not silk", () => {
  assert.deepEqual(getProductFabrics(kurtas[0]), ["Cotton"]);
  assert.deepEqual(getProductFabrics(kurtas[1]), ["Art Silk"]);
  assert.deepEqual(getProductFabrics(kurtas[2]), ["Silk", "Chanderi"]);
  assert.deepEqual(getProductFabrics(sarees[1]), ["Silk"]);
  assert.deepEqual(getProductFabrics(product("x", { name: "Art-Silk and Silk Kurta" })), ["Art Silk", "Silk"]);
  assert.deepEqual(getProductFabrics(product("x", { name: "" })), []);
});

test("price and discount follow the card and cart rules", () => {
  assert.equal(priceOf(kurtas[0]), 2519);
  assert.equal(priceOf(kurtas[3]), 5499);
  assert.equal(discountOf(kurtas[0]), 30);
  assert.equal(discountOf(kurtas[3]), 0);
  assert.equal(discountOf(product("x", { price: 1000, salePrice: 1200 })), 0, "a sale price above the price is no discount");
});

test("options list only what the products support, with counts", () => {
  const options = getFilterOptions(kurtas, "alankritha", KURTA_STYLES);
  assert.deepEqual(options.types, [
    { value: "Straight Fit", count: 2 },
    { value: "A-Line", count: 2 },
    { value: "Anarkali", count: 1 },
  ]);
  assert.deepEqual(options.sizes, [
    { value: "S", count: 1 },
    { value: "M", count: 2 },
    { value: "L", count: 1 },
    { value: "XL", count: 1 },
    { value: "XXL", count: 1 },
  ]);
  const noXxl = getFilterOptions(kurtas.slice(0, 3), "alankritha", KURTA_STYLES);
  assert.deepEqual(noXxl.sizes.at(-1), { value: "XXL", count: 0 }, "every kurta size is listed, even with no stock");
  assert.deepEqual(options.colors.map((o) => o.value), ["Red", "Yellow", "Blue"]);
  assert.deepEqual(options.colors.find((o) => o.value === "Red"), { value: "Red", count: 2 });
  assert.deepEqual(options.fabrics.map((o) => o.value), ["Art Silk", "Silk", "Cotton", "Chanderi"]);
  assert.deepEqual(options.discounts, [
    { value: 10, count: 4 },
    { value: 20, count: 3 }, // k3 is 19% off (rounded, as its card shows)
    { value: 30, count: 2 },
    { value: 40, count: 1 },
  ]);
  assert.deepEqual(options.priceRange, { min: 1800, max: 5500 });
});

test("sarees get no size filter, and an empty collection gets no price range", () => {
  const options = getFilterOptions(sarees, "ayanaa", SAREE_STYLES);
  assert.deepEqual(options.sizes, []);
  assert.deepEqual(options.types.map((o) => o.count), [1, 2, 0]);
  assert.equal(getFilterOptions([], "ayanaa", SAREE_STYLES).priceRange, null);
});

test("no filters keeps every product, in order", () => {
  assert.deepEqual(ids(applyCollectionFilters(kurtas, NO_FILTERS)), ["k1", "k2", "k3", "k4", "k5"]);
  assert.equal(countActiveFilters(NO_FILTERS), 0);
});

test("each filter narrows the products", () => {
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ types: ["A-Line"] }))), ["k3", "k5"]);
  assert.deepEqual(ids(applyCollectionFilters(sarees, filters({ types: ["Organza"] }))), ["s1", "s3"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ sizes: ["M"] }))), ["k2", "k3"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ colors: ["Red"] }))), ["k2", "k4"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ fabrics: ["Silk"] }))), ["k3"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ minDiscount: 30 }))), ["k1", "k2"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ priceMin: 2519, priceMax: 3500 }))), ["k1", "k3"]);
});

test("options within a filter widen it; different filters all apply", () => {
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ sizes: ["S", "XXL"] }))), ["k1", "k4"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ types: ["Straight Fit", "Anarkali"], colors: ["Red"] }))), ["k2", "k4"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ colors: ["Red"], sizes: ["M"], minDiscount: 20 }))), ["k2"]);
  assert.deepEqual(ids(applyCollectionFilters(kurtas, filters({ fabrics: ["Cotton"], sizes: ["M"] }))), []);
  const many = filters({ types: ["A-Line"], sizes: ["M", "XL"], colors: ["Yellow"], priceMax: 4000 });
  assert.deepEqual(ids(applyCollectionFilters(kurtas, many)), ["k3"]);
  assert.equal(countActiveFilters(many), 5); // 1 type, 2 sizes, 1 colour, the price range
});

test("a product missing sizes, colour or fabric is only excluded by those filters", () => {
  const bare = product("bare", { name: "", sizeStock: undefined as unknown as Product["sizeStock"], subcategory: undefined });
  assert.deepEqual(ids(applyCollectionFilters([bare], NO_FILTERS)), ["bare"]);
  assert.deepEqual(ids(applyCollectionFilters([bare], filters({ priceMax: 5000 }))), ["bare"]);
  for (const f of [{ sizes: ["M"] }, { colors: ["Red"] }, { fabrics: ["Cotton"] }, { types: ["A-Line"] }, { minDiscount: 10 }]) {
    assert.deepEqual(applyCollectionFilters([bare], filters(f)), [], JSON.stringify(f));
  }
});
