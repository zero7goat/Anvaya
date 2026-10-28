import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail, isValidPincode, normalizeIndianMobile } from "./validation.ts";
import { CLOTHING_SIZES, FREE_SIZE, describeSize, getSizeOptionsFor } from "./sizes.ts";

test("Indian mobile numbers: accepted formats", () => {
  assert.equal(normalizeIndianMobile("9845012345"), "9845012345");
  assert.equal(normalizeIndianMobile("+91 98450 12345"), "9845012345");
  assert.equal(normalizeIndianMobile("098450-12345"), "9845012345");
});

test("Indian mobile numbers: rejected formats", () => {
  assert.equal(normalizeIndianMobile("12345"), null);
  assert.equal(normalizeIndianMobile("5845012345"), null); // must start 6-9
  assert.equal(normalizeIndianMobile("98450123456789"), null); // too long
  assert.equal(normalizeIndianMobile(""), null);
});

test("PIN codes are six digits and never start with 0", () => {
  assert.equal(isValidPincode("560038"), true);
  assert.equal(isValidPincode(" 560038 "), true);
  assert.equal(isValidPincode("060038"), false);
  assert.equal(isValidPincode("56003"), false);
  assert.equal(isValidPincode("56003a"), false);
});

test("email is checked only for a basic shape", () => {
  assert.equal(isValidEmail("priya@example.com"), true);
  assert.equal(isValidEmail("priya@example"), false);
  assert.equal(isValidEmail("priya example.com"), false);
});

test("kurtas come in S to XXL in order; sarees are Free Size", () => {
  assert.deepEqual(getSizeOptionsFor("Kurtas"), ["S", "M", "L", "XL", "XXL"]);
  assert.deepEqual([...CLOTHING_SIZES], ["S", "M", "L", "XL", "XXL"]);
  assert.deepEqual(getSizeOptionsFor("Sarees"), [FREE_SIZE]);
  assert.equal(describeSize("M"), "size M");
  assert.equal(describeSize(FREE_SIZE), "Free Size");
});
