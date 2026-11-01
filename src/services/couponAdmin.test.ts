import { test } from "node:test";
import assert from "node:assert/strict";
import { CouponAdmin, checkCouponForm, describeCouponError, type Coupon, type CouponForm, type CouponGateway } from "./couponAdmin.ts";
import { parseCouponLookup } from "./offerService.ts";

const form = (changes: Partial<CouponForm> = {}): CouponForm => ({ code: "diwali20", title: " Diwali ", kind: "percent", value: "20", minSpend: "1500", enabled: true, ...changes });

test("a valid form becomes a coupon: code in capitals, text trimmed, numbers read", () => {
  assert.deepEqual(checkCouponForm(form()).value, { code: "DIWALI20", title: "Diwali", kind: "percent", value: 20, min_spend: 1500, enabled: true });
  assert.equal(checkCouponForm(form({ minSpend: "" })).value?.min_spend, 0);
  assert.equal(checkCouponForm(form({ kind: "flat", value: "500" })).value?.value, 500);
});

test("the form follows the database's coupon rules", () => {
  assert.match(checkCouponForm(form({ code: "AB" })).error!, /3 to 30/);
  assert.match(checkCouponForm(form({ code: "NEW YEAR" })).error!, /no spaces/);
  assert.match(checkCouponForm(form({ code: "A".repeat(31) })).error!, /3 to 30/);
  for (const value of ["", "0", "-5", "2.5", "abc"]) assert.match(checkCouponForm(form({ value })).error!, /whole-number/, value);
  assert.match(checkCouponForm(form({ value: "101" })).error!, /more than 100/);
  assert.equal(checkCouponForm(form({ kind: "flat", value: "101" })).ok, true);
  assert.match(checkCouponForm(form({ minSpend: "-1" })).error!, /minimum spend/);
  assert.match(checkCouponForm(form({ title: "x".repeat(101) })).error!, /100 characters/);
});

// Like RLS: writes by a non-admin fail (insert) or change no rows (update/delete)
function fakeDb(admin: boolean) {
  const rows = new Map<string, Coupon>();
  const gateway: CouponGateway = {
    list: async () => ({ data: [...rows.values()], error: null }),
    insert: async (c) => {
      if (!admin) return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
      if (rows.has(c.code)) return { data: null, error: { code: "23505", message: "duplicate key" } };
      rows.set(c.code, c);
      return { data: [{ code: c.code }], error: null };
    },
    update: async (code, changes) => {
      const row = rows.get(code);
      if (!admin || !row) return { data: [], error: null };
      rows.set(code, { ...row, ...changes });
      return { data: [{ code }], error: null };
    },
    remove: async (code) => ({ data: admin && rows.delete(code) ? [{ code }] : [], error: null }),
  };
  return { gateway, rows };
}

const coupon: Coupon = { code: "DIWALI20", title: "Diwali", kind: "percent", value: 20, min_spend: 1500, enabled: true };

test("an admin can create, edit, switch off and delete a coupon", async () => {
  const db = fakeDb(true);
  const admin = new CouponAdmin(async () => db.gateway);
  assert.deepEqual(await admin.create(coupon), { ok: true });
  assert.match((await admin.create(coupon)).error!, /already exists/);
  assert.deepEqual(await admin.update({ ...coupon, value: 25, enabled: false }), { ok: true });
  assert.equal(db.rows.get("DIWALI20")?.value, 25);
  assert.equal(db.rows.get("DIWALI20")?.enabled, false);
  assert.equal((await admin.list()).coupons?.length, 1);
  assert.deepEqual(await admin.remove("DIWALI20"), { ok: true });
  assert.equal(db.rows.size, 0);
  assert.match((await admin.remove("DIWALI20")).error!, /already deleted/);
});

test("a signed-in non-admin can't change coupons", async () => {
  const db = fakeDb(false);
  db.rows.set(coupon.code, coupon);
  const admin = new CouponAdmin(async () => db.gateway);
  for (const result of [await admin.create({ ...coupon, code: "OTHER" }), await admin.update({ ...coupon, value: 90 }), await admin.remove(coupon.code)]) {
    assert.match(result.error!, /don't have permission/);
  }
  assert.equal(db.rows.get(coupon.code)?.value, 20);
});

test("database errors become clear messages", () => {
  assert.match(describeCouponError({ code: "23514", message: "check" }), /rejected/);
  assert.match(describeCouponError({ message: "JWT expired" }), /session has expired/);
  assert.match(describeCouponError({ message: "TypeError: Failed to fetch" }), /Couldn't reach/);
});

test("the bag reads coupon_lookup's reply, and anything unexpected means no coupon", () => {
  assert.deepEqual(parseCouponLookup({ available: true, offer: { code: "DIWALI20", title: "Diwali", kind: "percent", value: 20, min_spend: 1500 } }), {
    available: true,
    offer: { id: "DIWALI20", code: "DIWALI20", title: "Diwali", type: "percent", discountValue: 20, minSpend: 1500, enabled: true },
  });
  assert.deepEqual(parseCouponLookup({ available: true, offer: null }), { available: true, offer: null });
  for (const bad of [null, undefined, "x", {}, { available: "yes" }]) assert.deepEqual(parseCouponLookup(bad), { available: false, offer: null });
  assert.equal(parseCouponLookup({ available: true, offer: { code: "X", kind: "free", value: 1, min_spend: 0 } }).offer, null);
});
