import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToProduct, rowsToProducts } from "./catalogueRows.ts";

const kurtaRow = {
  id: "alk-001",
  name: "Turquoise Kurta",
  description: "Cotton",
  collection: "alankritha",
  category: "Kurtas",
  subcategory: "Straight Fit",
  price: 3599,
  sale_price: 2519,
  image: "https://example.com/a.jpg",
  additional_images: [],
  is_featured: true,
  is_new_arrival: false,
  status: "enabled",
  created_at: "2026-08-01T10:00:00+00:00",
  updated_at: "2026-10-20T14:30:00+00:00",
  product_stock: [
    { size: "XL", quantity: 2 },
    { size: "S", quantity: 4 },
    { size: "M", quantity: 6 },
  ],
  product_reviews: [
    { id: "rev-a", author: "A", rating: 4, comment: "Older", review_date: "2026-09-01", verified: false, brand_reply: null },
    { id: "rev-b", author: "B", rating: 5, comment: "Newer", review_date: "2026-09-12", verified: true, brand_reply: "Thanks" },
  ],
};

test("a products row becomes the site's Product shape", () => {
  const p = rowToProduct(kurtaRow)!;
  assert.equal(p.id, "alk-001");
  assert.equal(p.salePrice, 2519);
  assert.equal(p.subcategory, "Straight Fit");
  assert.equal(p.collection, "alankritha");
  assert.equal(p.isFeatured, true);
  assert.equal(p.status, "enabled");
});

test("stock lists every kurta size in order, missing sizes as sold out", () => {
  const p = rowToProduct(kurtaRow)!;
  assert.deepEqual(Object.entries(p.sizeStock), [["S", 4], ["M", 6], ["L", 0], ["XL", 2], ["XXL", 0]]);
});

test("sarees are Free Size only", () => {
  const p = rowToProduct({ ...kurtaRow, category: "Sarees", collection: "ayanaa", product_stock: [{ size: "Free Size", quantity: 3 }, { size: "M", quantity: 9 }] })!;
  assert.deepEqual(p.sizeStock, { "Free Size": 3 });
  assert.equal(p.collection, "ayanaa");
});

test("reviews are newest first; nulls become undefined", () => {
  const p = rowToProduct({ ...kurtaRow, sale_price: null, subcategory: null })!;
  assert.deepEqual(p.reviews.map((r) => r.id), ["rev-b", "rev-a"]);
  assert.equal(p.reviews[1].brandReply, undefined);
  assert.equal(p.reviews[1].verified, false);
  assert.equal(p.salePrice, undefined);
  assert.equal(p.subcategory, undefined);
});

test("rows the shop cannot show are skipped", () => {
  const rows = [
    kurtaRow,
    { ...kurtaRow, id: "no-price", price: null },
    { ...kurtaRow, id: "bad-category", category: "Shoes" },
    { ...kurtaRow, id: "no-image", image: "" },
    "not a row",
  ];
  assert.deepEqual(rowsToProducts(rows).map((p) => p.id), ["alk-001"]);
  assert.deepEqual(rowsToProducts(null), []);
});

test("a sale price above the full price is ignored", () => {
  assert.equal(rowToProduct({ ...kurtaRow, sale_price: 4000 })!.salePrice, undefined);
});
