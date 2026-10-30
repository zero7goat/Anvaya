import { test } from "node:test";
import assert from "node:assert/strict";
import { filterInventory } from "./inventorySearch.ts";
import type { CollectionType } from "../types";

const product = (id: string, name: string, collection: CollectionType) => ({ id, name, collection });
const kurta = product("alk-010", "Powder Blue Printed Short Kurta", "alankritha");
const saree = product("alk-005", "Royal Mayura Banarasi Katan Silk Saree", "ayanaa");
const all = [kurta, saree];
const ids = (search: string) => filterInventory(all, search).map((p) => p.id);

test("searches name, id and collection, ignoring case and spaces", () => {
  assert.deepEqual(ids("powder blue"), ["alk-010"]);
  assert.deepEqual(ids("BANARASI"), ["alk-005"]);
  assert.deepEqual(ids("ALK-005"), ["alk-005"]);
  assert.deepEqual(ids("alk-"), ["alk-010", "alk-005"]);
  assert.deepEqual(ids("Alankritha"), ["alk-010"]);
  assert.deepEqual(ids("  ayanaa  "), ["alk-005"]);
});

test("an empty search shows everything; no match shows nothing", () => {
  assert.equal(filterInventory(all, ""), all);
  assert.equal(filterInventory(all, "   "), all);
  assert.deepEqual(ids("zzqx"), []);
});

test("a product without a collection is still searchable", () => {
  assert.deepEqual(filterInventory([{ id: "x-1", name: "Plain" }], "plain").map((p) => p.id), ["x-1"]);
});
