import { test } from "node:test";
import assert from "node:assert/strict";
import { FreshOrderTracker, newestCreatedAt, titleWithCount, unseenOrders, type AlertableOrder } from "./orderAlerts.ts";

const order = (id: string, createdAt: string): AlertableOrder => ({ id, reference: `ANV-${id}`, createdAt, total: 1000 });
const a = order("a", "2026-10-30T00:05:38.825558+00:00");
const b = order("b", "2026-10-30T01:00:00.000000+00:00");
const c = order("c", "2026-10-30T02:00:00.123456+00:00");

test("the first read is only the starting point; later reads announce each new order once", () => {
  const tracker = new FreshOrderTracker();
  assert.deepEqual(tracker.next([b, a]), []);
  assert.deepEqual(tracker.next([b, a]), [], "same list again: nothing new");
  assert.deepEqual(tracker.next([c, b, a]).map((o) => o.id), ["c"]);
  assert.deepEqual(tracker.next([c, b, a]), [], "not announced twice");
  assert.deepEqual(tracker.next([b, a]), [], "an order dropping out of the list...");
  assert.deepEqual(tracker.next([c, b, a]), [], "...and coming back is not announced again");
});

test("a status change (same order, new details) is not a new order", () => {
  const tracker = new FreshOrderTracker();
  tracker.next([a]);
  assert.deepEqual(tracker.next([{ ...a, total: 900 }]), []);
});

test("sign in, sign out, sign in again: orders placed in between never chime (the dashboard starts a new tracker per sign-in)", () => {
  let tracker = new FreshOrderTracker(); // first sign-in
  assert.deepEqual(tracker.next([a]), []);
  assert.deepEqual(tracker.next([b, a]).map((o) => o.id), ["b"], "placed while signed in: announced");
  tracker = new FreshOrderTracker(); // signed out; orders are cleared from memory
  assert.deepEqual(tracker.next([c, b, a]), [], "c was placed while signed out: only the badge shows it, no chime");
  assert.deepEqual(tracker.next([c, b, a]), [], "the next minute's read: still nothing");
  const statusChanged = [{ ...c, total: 1200 }, b, a];
  assert.deepEqual(tracker.next(statusChanged), [], "a status update re-read is not a new order");
});

test("unseen orders are those placed after the admin last looked", () => {
  assert.deepEqual(unseenOrders([c, b, a], undefined), []);
  assert.deepEqual(unseenOrders([c, b, a], b.createdAt).map((o) => o.id), ["c"]);
  assert.deepEqual(unseenOrders([c, b, a], a.createdAt).map((o) => o.id), ["c", "b"]);
  // The stored timestamp is the order's own text, so its microseconds never make it "newer"
  assert.deepEqual(unseenOrders([c], c.createdAt), []);
});

test("newest order and tab title", () => {
  assert.equal(newestCreatedAt([a, c, b]), c.createdAt);
  assert.equal(newestCreatedAt([]), undefined);
  assert.equal(titleWithCount("ANVAYA", 0), "ANVAYA");
  assert.equal(titleWithCount("ANVAYA", 1), "(1) New order · ANVAYA");
  assert.equal(titleWithCount("ANVAYA", 3), "(3) New orders · ANVAYA");
});
