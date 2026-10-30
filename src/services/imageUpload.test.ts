import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SOURCE_BYTES, checkImageFile, describeUploadError, fitWithin, productImagePath } from "./imageUpload.ts";

test("only JPEG, PNG and WebP photos of a sensible size are accepted", () => {
  assert.equal(checkImageFile({ type: "image/jpeg", size: 2_000_000 }), null);
  assert.equal(checkImageFile({ type: "image/png", size: 10 }), null);
  assert.equal(checkImageFile({ type: "image/webp", size: 10 }), null);
  for (const type of ["image/gif", "image/svg+xml", "image/heic", "application/pdf", ""]) {
    assert.match(checkImageFile({ type, size: 10 })!, /JPEG, PNG or WebP/, type);
  }
  assert.match(checkImageFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 })!, /over 30 MB/);
  assert.match(checkImageFile({ type: "image/jpeg", size: 0 })!, /empty/);
});

test("photos are scaled down to 1600px on the longest side, never up", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(1080, 1920), { width: 900, height: 1600 });
  assert.deepEqual(fitWithin(800, 1200), { width: 800, height: 1200 });
  assert.deepEqual(fitWithin(1600, 1600), { width: 1600, height: 1600 });
});

test("each upload gets its own path under the product, so nothing is overwritten", () => {
  assert.equal(productImagePath("alk-001", 1793300000000, "abc123"), "products/alk-001/1793300000000-abc123.webp");
  assert.equal(productImagePath("Odd ID/../x", 1, "r"), "products/odd-id----x/1-r.webp");
  assert.notEqual(productImagePath("alk-001"), productImagePath("alk-001"));
});

test("storage errors become clear dashboard messages", () => {
  assert.match(describeUploadError(400, "Bucket not found Bucket not found"), /aren't set up yet/);
  assert.match(describeUploadError(403, "Unauthorized new row violates row-level security policy"), /isn't allowed to upload/);
  assert.match(describeUploadError(401, "jwt expired"), /session has expired/);
  assert.match(describeUploadError(413, "Payload too large"), /too large/);
  assert.match(describeUploadError(500, "boom"), /couldn't be uploaded/);
});
