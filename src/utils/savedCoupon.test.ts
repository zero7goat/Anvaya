import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSavedCoupon } from "./savedCoupon.ts";

test("a stored coupon is read back as an upper-case code", () => {
  assert.equal(parseSavedCoupon("ALANKRITHA10"), "ALANKRITHA10");
  assert.equal(parseSavedCoupon("  festive500 "), "FESTIVE500");
});

test("anything that isn't a plain code is ignored, so it can't affect the bag", () => {
  for (const raw of [null, undefined, "", "   ", '{"discount":500}', "FESTIVE 500", "<script>", "X".repeat(33), "500₹"]) {
    assert.equal(parseSavedCoupon(raw), undefined, String(raw));
  }
});
