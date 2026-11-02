import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SOURCE_BYTES, PHOTO_ASPECT, checkImageFile, croppedSize, describeDeleteProblem, describeUploadError, fitWithin, photosToDelete, pickCompressed, productImagePath, storedImagePath,
} from "./imageUpload.ts";

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

const BASE = "https://proj.supabase.co";
const stored = (name: string, id = "alk3k01") => `${BASE}/storage/v1/object/public/product-images/products/${id}/${name}.webp`;

test("compression keeps the best quality that reaches about 500 KB, else the smallest that fits 5 MB", () => {
  assert.equal(pickCompressed([{ size: 900_000 }, { size: 480_000 }, { size: 300_000 }])!.size, 480_000);
  assert.equal(pickCompressed([{ size: 4_000_000 }, { size: 2_000_000 }])!.size, 2_000_000);
  assert.equal(pickCompressed([{ size: 6_000_000 }, { size: 5_500_000 }]), null);
});

test("only photos uploaded to this bucket's product folders can be deleted", () => {
  assert.equal(storedImagePath(stored("1793-abc"), BASE), "products/alk3k01/1793-abc.webp");
  assert.equal(storedImagePath(`${stored("1793-abc")}?v=2`, BASE + "/"), "products/alk3k01/1793-abc.webp");
  for (const url of [
    "https://www.rangriti.com/x.jpg",
    "/images/products/alk-001-front.jpg",
    `${BASE}/storage/v1/object/public/other-bucket/products/a/b.webp`,
    `${BASE}/storage/v1/object/public/product-images/products/a/../b.webp`,
    `${BASE}/storage/v1/object/public/product-images/secret.webp`,
    "",
  ]) {
    assert.equal(storedImagePath(url, BASE), null, url);
  }
  assert.equal(storedImagePath(stored("a"), undefined), null);
});

test("after a save, only photos the product no longer uses are deleted", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((n) => stored(n));
  // Had a and b, uploaded c and d in the form, kept b and c
  assert.deepEqual(photosToDelete([a, b], [c, d], [b, c], BASE), ["products/alk3k01/a.webp", "products/alk3k01/d.webp"]);
  // Outside photos are never deleted, and nothing is listed twice
  assert.deepEqual(photosToDelete(["https://e.com/x.jpg", a], [a], [], BASE), ["products/alk3k01/a.webp"]);
  assert.deepEqual(photosToDelete([a], [], [a], BASE), []);
});

test("a delete the access rules refuse is reported, not ignored", () => {
  assert.equal(describeDeleteProblem(2, 2), null);
  assert.match(describeDeleteProblem(2, 0)!, /2 old photos couldn't be deleted.*product_images_delete\.sql/);
  assert.match(describeDeleteProblem(1, 0)!, /1 old photo couldn't/);
  assert.match(describeDeleteProblem(1, 0, "jwt expired")!, /session has expired/);
  assert.match(describeDeleteProblem(1, 0, "boom")!, /couldn't be deleted/);
});

test("a chosen part is saved at exactly 3:4, up to 1200 x 1600 and never enlarged", () => {
  assert.deepEqual(croppedSize({ width: 3000 }), { width: 1200, height: 1600 });
  assert.deepEqual(croppedSize({ width: 900 }), { width: 900, height: 1200 });
  assert.deepEqual(croppedSize({ width: 600.4 }), { width: 600, height: 800 });
  assert.deepEqual(croppedSize({ width: 1 }), { width: 3, height: 4 });
  assert.equal(PHOTO_ASPECT, 0.75);
});
