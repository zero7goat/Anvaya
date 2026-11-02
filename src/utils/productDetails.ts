import type { Product } from "../types";

export interface ProductDetail {
  label: string;
  value: string;
}

// A label starts a sentence: "Neckline: Round neck." A capital, then up to 30 letters,
// spaces, slashes, ampersands or hyphens, then a colon and a space
const LABEL = /(^|\.\s+)([A-Z][A-Za-z][A-Za-z /&-]{0,30}):\s+/g;

/**
 * Splits a description written as "Label: value. Label: value." into its details, shown as
 * a two-column list on the product page. Any text before the first label is kept as the
 * intro paragraph; a description with no labels is all intro.
 */
export function parseProductDetails(description: string): { intro: string; details: ProductDetail[] } {
  const text = (description || "").trim();
  const starts: { at: number; valueAt: number; label: string }[] = [];
  for (const m of text.matchAll(LABEL)) {
    const at = (m.index ?? 0) + m[1].length;
    starts.push({ at, valueAt: (m.index ?? 0) + m[0].length, label: m[2].trim() });
  }
  if (starts.length === 0) return { intro: text, details: [] };

  const intro = text.slice(0, starts[0].at).trim();
  const details = starts
    .map((s, i) => ({
      label: s.label,
      value: text
        .slice(s.valueAt, i + 1 < starts.length ? starts[i + 1].at : text.length)
        .trim()
        .replace(/\.$/, "")
        .trim(),
    }))
    .filter((d) => d.value !== "");
  return { intro, details };
}

// "Garden Whisper (Green)" → base "Garden Whisper", colour "Green"
const COLOUR_NAME = /^(.*\S)\s*\(([^()]+)\)\s*$/;

export function splitColourName(name: string): { base: string; colour: string } | null {
  const m = COLOUR_NAME.exec(name || "");
  return m ? { base: m[1].trim(), colour: m[2].trim() } : null;
}

/**
 * Other colours of the same piece: products named "<same name> (<colour>)" in the same
 * collection and category. Each colour keeps its own product code, stock and photos.
 * Returns every colour including this one (in name order), or [] when there is no other.
 */
export function colourOptions(product: Product, products: Product[]): { product: Product; colour: string }[] {
  const own = splitColourName(product.name);
  if (!own) return [];
  const base = own.base.toLowerCase();
  const options = products
    .filter((p) => p.collection === product.collection && p.category === product.category)
    .map((p) => ({ product: p, split: splitColourName(p.name) }))
    .filter((o) => o.split && o.split.base.toLowerCase() === base)
    .map((o) => ({ product: o.product, colour: o.split!.colour }))
    .sort((a, b) => a.colour.localeCompare(b.colour));
  return options.length > 1 ? options : [];
}
