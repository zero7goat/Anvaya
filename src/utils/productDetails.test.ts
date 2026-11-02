import { test } from "node:test";
import assert from "node:assert/strict";
import { colourOptions, parseProductDetails, splitColourName } from "./productDetails.ts";
import type { Product } from "../types";

test("splits 'Label: value.' descriptions into details", () => {
  const { intro, details } = parseProductDetails(
    "Top style: A-line. Top length: Calf-length (below the knee). Sleeve type: 3/4th. Dupatta fabric: Organza (sheer), with matching painted work. Colour: Lavender."
  );
  assert.equal(intro, "");
  assert.deepEqual(details, [
    { label: "Top style", value: "A-line" },
    { label: "Top length", value: "Calf-length (below the knee)" },
    { label: "Sleeve type", value: "3/4th" },
    { label: "Dupatta fabric", value: "Organza (sheer), with matching painted work" },
    { label: "Colour", value: "Lavender" },
  ]);
});

test("keeps a value with a semicolon or slash whole", () => {
  const { details } = parseProductDetails("Size and fit: Relaxed fit; comfortable silhouette. Top length: Full length / Maxi length.");
  assert.deepEqual(details.map((d) => d.value), ["Relaxed fit; comfortable silhouette", "Full length / Maxi length"]);
});

test("text before the first label is the intro; no labels means all intro", () => {
  assert.deepEqual(parseProductDetails("A light summer kurta. Fabric: Cotton."), {
    intro: "A light summer kurta.",
    details: [{ label: "Fabric", value: "Cotton" }],
  });
  const prose = "Handcrafted master weave in rich royal purple and gold.";
  assert.deepEqual(parseProductDetails(prose), { intro: prose, details: [] });
  assert.deepEqual(parseProductDetails(""), { intro: "", details: [] });
});

test("reads the colour from a name in brackets", () => {
  assert.deepEqual(splitColourName("Garden Whisper (Yellow)"), { base: "Garden Whisper", colour: "Yellow" });
  assert.equal(splitColourName("Rosy Grace"), null);
});

const piece = (id: string, name: string, extra: Partial<Product> = {}) =>
  ({ id, name, collection: "alankritha", category: "Kurtas", ...extra }) as Product;

test("links colours of the same piece, and only those", () => {
  const green = piece("alk3k09", "Garden Whisper (Green)");
  const yellow = piece("alk3k10", "garden whisper (Yellow)");
  const all = [green, yellow, piece("alk3k07", "Rosy Grace"), piece("x", "Garden Whisper (Red)", { category: "Sarees" })];
  assert.deepEqual(colourOptions(yellow, all).map((o) => [o.product.id, o.colour]), [
    ["alk3k09", "Green"],
    ["alk3k10", "Yellow"],
  ]);
  assert.deepEqual(colourOptions(piece("alk3k07", "Rosy Grace"), all), []);
  // Only one colour published: nothing to switch to
  assert.deepEqual(colourOptions(green, [green]), []);
});
