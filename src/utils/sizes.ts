import type { Product } from "../types";

// Kurta sizes, in display order
export const CLOTHING_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

// Sarees are one size
export const FREE_SIZE = "Free Size";
export const SAREE_SIZES = [FREE_SIZE] as const;

// Every size the shop sells, in display order (for filters that span both collections)
export const ALL_SIZES: readonly string[] = [...CLOTHING_SIZES, FREE_SIZE];

// "size M" in running text, but just "Free Size" for one-size pieces
export const describeSize = (size: string) => (size === FREE_SIZE ? FREE_SIZE : `size ${size}`);

export const getSizeOptionsFor = (category: Product["category"] | string): string[] =>
  category === "Sarees" ? [...SAREE_SIZES] : [...CLOTHING_SIZES];
