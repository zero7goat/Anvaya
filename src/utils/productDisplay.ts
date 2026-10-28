import type { MouseEvent } from "react";
import { CollectionType, Product } from "../types";
import { getProductImages } from "../data/imageRegistry";

/**
 * Small, shared presentation helpers for product data, so the product card,
 * product page and quick view all derive prices, stock and images the same way.
 */

export const formatINR = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

// Matches the cart and checkout: the sale price is charged whenever one is set
export const getEffectivePrice = (product: Product) => product.salePrice || product.price;

export const getDiscountPercent = (product: Product): number | null =>
  product.salePrice && product.salePrice < product.price
    ? Math.round(((product.price - product.salePrice) / product.price) * 100)
    : null;

export const getCollectionKey = (product: Product): CollectionType =>
  product.collection || (product.category === "Sarees" ? "ayanaa" : "alankritha");

// Supported sizes, in display order. Every product (kurtas and sarees) uses these.
export const CLOTHING_SIZES = ["S", "M", "L", "XL"] as const;

// Sizes a shopper can choose from: every supported size, with sizes that have no stock
// configured treated as sold out.
export const getSizeOptions = (_product: Product): string[] => [...CLOTHING_SIZES];

export const getAvailableSizes = (product: Product): string[] =>
  getSizeOptions(product).filter((size) => (product.sizeStock?.[size] || 0) > 0);

// Main image first, then any additional images, without duplicates or blanks.
// Resolved through the image registry, so local files mapped to the product win.
export const getGalleryImages = (product: Product): string[] => getProductImages(product);

export const getProductPath = (productId: string) => `/product/${encodeURIComponent(productId)}`;

// Left-click without modifier keys: handle in-app. Anything else (new tab, new
// window, middle click) is left to the browser's normal link behaviour.
export const isPlainLeftClick = (e: MouseEvent) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
