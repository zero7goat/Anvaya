import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoute } from "./routes.ts";

const view = (path: string, hash = "") => resolveRoute(path, hash).view;

test("every page the site links to resolves to itself", () => {
  assert.equal(view("/"), "store");
  assert.equal(view("/index.html"), "store");
  assert.equal(view("/collection/alankritha"), "collection_alankritha");
  assert.equal(view("/collection/ayanaa"), "collection_ayanaa");
  assert.equal(view("/admin"), "admin");
  assert.equal(view("/shipping-and-returns"), "policy_shipping");
  assert.equal(view("/terms-and-conditions"), "policy_terms");
  assert.equal(view("/privacy-policy/"), "policy_privacy");
  assert.deepEqual(resolveRoute("/product/alk-001", ""),{ view: "product", productId: "alk-001" });
  assert.deepEqual(resolveRoute("/product/a%20b", ""), { view: "product", productId: "a b" });
});

test("a trailing slash is ignored", () => {
  assert.equal(view("/collection/ayanaa/"), "collection_ayanaa");
  assert.equal(view("/admin/"), "admin");
  assert.deepEqual(resolveRoute("/product/alk-002/", ""), { view: "product", productId: "alk-002" });
});

test("older hash links still open their page; in-page anchors stay on the homepage", () => {
  assert.deepEqual(resolveRoute("/", "#/product/alk-003"), { view: "product", productId: "alk-003" });
  assert.equal(view("/", "#/collection/alankritha"), "collection_alankritha");
  assert.equal(view("/", "#/collection/ayanaa"), "collection_ayanaa");
  assert.equal(view("/", "#/admin"), "admin");
  assert.equal(view("/", "#admin"), "admin");
  assert.equal(view("/", "#product-catalog-section"), "store");
});

test("anything else is not found", () => {
  for (const path of ["/some/random/page", "/collections", "/collection/other", "/collection/alankritha/extra", "/product", "/product/", "/product/a/b", "/administrator", "/about", "/alankritha"]) {
    assert.equal(view(path), "not_found", path);
  }
  assert.equal(view("/product/%E0%A4"), "not_found"); // malformed escape
  assert.equal(view("/", "#/product/alk-1/extra"), "store");
});
