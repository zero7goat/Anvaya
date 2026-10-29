import type { CollectionType, Product } from "../types";
import { CLOTHING_SIZES } from "./sizes.ts";

/**
 * Product filters for a collection page. Every option is worked out from the products
 * themselves, so the page never offers a filter no product can match:
 * - Type: the product's style (subcategory), from the collection's own list.
 * - Size: kurta sizes with stock (sarees are Free Size, so they have no size filter).
 * - Colour and fabric: products have no separate fields for these, so they come from
 *   words in the product name only ("Turquoise Cotton ... Kurta"). Descriptions are
 *   left out because they mention trims ("gold zari") that aren't the main colour.
 *   A product whose name names neither simply doesn't match those filters.
 * - Discount and price: from the price and sale price, with the same rules the
 *   product cards and cart use.
 * Kept free of runtime imports beyond ./sizes.ts so it can be unit tested with Node.
 */

export interface CollectionFilters {
  types: string[];
  sizes: string[];
  colors: string[];
  fabrics: string[];
  minDiscount: number | null; // percent off, at least
  priceMin: number | null; // rupees, inclusive; null = no lower limit
  priceMax: number | null; // rupees, inclusive; null = no upper limit
}

export const NO_FILTERS: CollectionFilters = {
  types: [],
  sizes: [],
  colors: [],
  fabrics: [],
  minDiscount: null,
  priceMin: null,
  priceMax: null,
};

// Same rules as getEffectivePrice / getDiscountPercent in productDisplay.ts
export const priceOf = (product: Product): number => product.salePrice || product.price;

export const discountOf = (product: Product): number =>
  product.salePrice && product.salePrice < product.price
    ? Math.round(((product.price - product.salePrice) / product.price) * 100)
    : 0;

// Colour families and the words in a product name that place a product in them
const COLOR_WORDS: [family: string, words: string[]][] = [
  ["Red", ["red", "crimson", "maroon", "wine", "burgundy"]],
  ["Pink", ["pink", "rose", "blush", "magenta", "fuchsia"]],
  ["Orange", ["orange", "rust", "tangerine", "saffron", "peach"]],
  ["Yellow", ["yellow", "mustard", "turmeric", "lemon"]],
  ["Green", ["green", "emerald", "pine", "sage", "olive", "mint"]],
  ["Blue", ["blue", "turquoise", "navy", "indigo", "teal", "aqua"]],
  ["Purple", ["purple", "violet", "lilac", "lavender", "mauve", "plum"]],
  ["White", ["white", "ivory", "cream"]],
  ["Black", ["black", "charcoal"]],
  ["Grey", ["grey", "gray", "silver"]],
  ["Beige", ["beige", "brown", "camel", "khaki"]],
  ["Gold", ["gold", "golden"]],
];

// Fabrics, and the words in a product name that name them. "Art silk" is a different
// fabric from silk, so it is matched first and taken out before looking for "silk".
const FABRIC_WORDS: [fabric: string, words: string[]][] = [
  ["Art Silk", ["art silk"]],
  ["Silk", ["silk"]],
  ["Cotton", ["cotton"]],
  ["Chanderi", ["chanderi"]],
  ["Organza", ["organza"]],
  ["Georgette", ["georgette"]],
  ["Chiffon", ["chiffon"]],
  ["Crepe", ["crepe"]],
  ["Linen", ["linen"]],
  ["Rayon", ["rayon"]],
  ["Muslin", ["muslin"]],
  ["Satin", ["satin"]],
  ["Velvet", ["velvet"]],
  ["Khadi", ["khadi"]],
];

const hasWord = (text: string, word: string) =>
  new RegExp(`(^|[^a-z])${word.replace(/ /g, "[\\s-]+")}([^a-z]|$)`).test(text);

const matchVocabulary = (text: string, vocabulary: [string, string[]][]): string[] =>
  vocabulary.filter(([, words]) => words.some((word) => hasWord(text, word))).map(([label]) => label);

export const getProductColors = (product: Product): string[] =>
  matchVocabulary((product.name || "").toLowerCase(), COLOR_WORDS);

export const getProductFabrics = (product: Product): string[] => {
  const name = (product.name || "").toLowerCase();
  const artSilk = hasWord(name, "art silk");
  const rest = artSilk ? name.replace(/art[\s-]+silk/g, " ") : name;
  return [...(artSilk ? ["Art Silk"] : []), ...matchVocabulary(rest, FABRIC_WORDS.slice(1))];
};

// A kurta size counts when it has stock (as on the product page)
const hasSize = (product: Product, size: string) => (product.sizeStock?.[size] || 0) > 0;

export const DISCOUNT_STEPS = [10, 20, 30, 40, 50];

export interface FilterOption {
  value: string;
  count: number;
}

export interface FilterOptions {
  types: FilterOption[];
  sizes: FilterOption[];
  colors: FilterOption[];
  fabrics: FilterOption[];
  discounts: { value: number; count: number }[];
  // Slider range, rounded out to whole hundreds; null when there are no products
  priceRange: { min: number; max: number } | null;
}

const countBy = (products: Product[], labels: string[], valuesOf: (p: Product) => string[]): FilterOption[] =>
  labels
    .map((value) => ({ value, count: products.filter((p) => valuesOf(p).includes(value)).length }))
    .filter((option) => option.count > 0);

/**
 * What can be filtered in this collection, with how many of its products match each
 * option. Options no product matches are left out (types are always listed, since
 * they are the collection's fixed styles).
 */
export function getFilterOptions(products: Product[], collection: CollectionType, styles: string[]): FilterOptions {
  const prices = products.map(priceOf).filter((price) => Number.isFinite(price) && price > 0);
  return {
    types: styles.map((value) => ({ value, count: products.filter((p) => p.subcategory === value).length })),
    sizes: collection === "alankritha" ? countBy(products, [...CLOTHING_SIZES], (p) => CLOTHING_SIZES.filter((s) => hasSize(p, s))) : [],
    colors: countBy(products, COLOR_WORDS.map(([label]) => label), getProductColors),
    fabrics: countBy(products, FABRIC_WORDS.map(([label]) => label), getProductFabrics),
    discounts: DISCOUNT_STEPS.map((value) => ({ value, count: products.filter((p) => discountOf(p) >= value).length })).filter(
      (step) => step.count > 0,
    ),
    priceRange: prices.length
      ? { min: Math.floor(Math.min(...prices) / 100) * 100, max: Math.ceil(Math.max(...prices) / 100) * 100 }
      : null,
  };
}

/**
 * Products matching every active filter. Within one filter any chosen option matches
 * (Cotton or Silk); across filters all must match (Cotton and size M). Order is kept,
 * so sorting done beforehand still applies.
 */
export function applyCollectionFilters(products: Product[], filters: CollectionFilters): Product[] {
  return products.filter((p) => {
    if (filters.types.length && !filters.types.includes(p.subcategory ?? "")) return false;
    if (filters.sizes.length && !filters.sizes.some((size) => hasSize(p, size))) return false;
    if (filters.colors.length && !getProductColors(p).some((c) => filters.colors.includes(c))) return false;
    if (filters.fabrics.length && !getProductFabrics(p).some((f) => filters.fabrics.includes(f))) return false;
    if (filters.minDiscount !== null && discountOf(p) < filters.minDiscount) return false;
    const price = priceOf(p);
    if (filters.priceMin !== null && price < filters.priceMin) return false;
    if (filters.priceMax !== null && price > filters.priceMax) return false;
    return true;
  });
}

/** Number of filters in use (each chosen option counts; the price range counts once) */
export const countActiveFilters = (filters: CollectionFilters): number =>
  filters.types.length +
  filters.sizes.length +
  filters.colors.length +
  filters.fabrics.length +
  (filters.minDiscount !== null ? 1 : 0) +
  (filters.priceMin !== null || filters.priceMax !== null ? 1 : 0);
