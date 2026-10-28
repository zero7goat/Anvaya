import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { RECENTLY_VIEWED_LIMIT, getRecentlyViewedIds, recordRecentlyViewed } from "./recentlyViewed.ts";

// Minimal in-memory localStorage for Node
const store = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage;

beforeEach(() => store.clear());

test("newest first, without duplicates", () => {
  recordRecentlyViewed("a");
  recordRecentlyViewed("b");
  recordRecentlyViewed("a");
  assert.deepEqual(getRecentlyViewedIds(), ["a", "b"]);
});

test("keeps only the latest few", () => {
  for (let i = 0; i < RECENTLY_VIEWED_LIMIT + 3; i++) recordRecentlyViewed(`p${i}`);
  const ids = getRecentlyViewedIds();
  assert.equal(ids.length, RECENTLY_VIEWED_LIMIT);
  assert.equal(ids[0], `p${RECENTLY_VIEWED_LIMIT + 2}`);
});

test("corrupt or foreign data is ignored", () => {
  store.set("anvaya_recently_viewed", "{not json");
  assert.deepEqual(getRecentlyViewedIds(), []);
  store.set("anvaya_recently_viewed", JSON.stringify(["a", 5, null, "b"]));
  assert.deepEqual(getRecentlyViewedIds(), ["a", "b"]);
});

test("blocked storage never throws", () => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(getRecentlyViewedIds(), []);
  assert.doesNotThrow(() => recordRecentlyViewed("a"));
  (globalThis as { localStorage?: unknown }).localStorage = memoryStorage;
});
