/**
 * Rules for products edited in the admin dashboard. The database enforces the
 * same limits (supabase/drafts/products_schema.sql); checking here first gives
 * clear messages before anything is sent.
 */

import type { CollectionType } from "../types";
import { getSizeOptionsFor } from "./sizes.ts";

export type ProductCategory = "Kurtas" | "Sarees";

// Alankritha is kurtas only, Ayanaa is sarees only
export const COLLECTION_FOR_CATEGORY: Record<ProductCategory, CollectionType> = {
  Kurtas: "alankritha",
  Sarees: "ayanaa",
};

// Styles offered in each collection (shop menus and the admin form)
export const COLLECTION_STYLES: Record<CollectionType, string[]> = {
  alankritha: ["Straight Fit", "A-Line", "Anarkali"],
  ayanaa: ["Banarasi Silk", "Organza", "Katan Silk"],
};

export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_PRICE = 1_000_000; // ₹10,00,000
export const MAX_STOCK = 9999;
export const MAX_PHOTOS = 8; // main photo plus gallery

/** What the product form holds (prices as typed) */
export interface ProductFormValues {
  name: string;
  description: string;
  collection: CollectionType;
  category: string;
  subcategory: string;
  price: string;
  salePrice: string;
  image: string;
  /** Gallery photos shown after the main one */
  additionalImages?: string[];
  isFeatured: boolean;
  isNewArrival: boolean;
  status: "enabled" | "disabled";
  sizeStock: Record<string, number | string>;
}

/** A checked product, ready to save */
export interface ProductDraft {
  name: string;
  description: string;
  collection: CollectionType;
  category: ProductCategory;
  subcategory: string;
  price: number;
  salePrice?: number;
  image: string;
  additionalImages: string[];
  isFeatured: boolean;
  isNewArrival: boolean;
  status: "enabled" | "disabled";
  sizeStock: Record<string, number>; // exactly the sizes this category is sold in
}

export type Checked<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

const wholeRupees = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

/**
 * An image is optional (the site shows "Image coming soon"); when given it must be
 * a file on this site (/images/...) or an https:// address.
 */
export const isAllowedImage = (value: string): boolean => {
  const image = value.trim();
  if (!image) return true;
  if (image.startsWith("/images/") && !image.includes("..") && !/\s/.test(image)) return true;
  try {
    const url = new URL(image);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
};

export const checkStockQuantity = (value: number | string): Checked<number> => {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: "Stock must be a whole number of 0 or more." };
  const quantity = Number(text);
  if (quantity > MAX_STOCK) return { ok: false, error: `Stock can't be more than ${MAX_STOCK}.` };
  return { ok: true, value: quantity };
};

export function checkProductForm(form: ProductFormValues): Checked<ProductDraft> {
  const name = form.name.trim();
  if (!name) return { ok: false, error: "Enter a product name." };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `Keep the name under ${MAX_NAME_LENGTH} characters.` };

  const description = form.description.trim();
  if (!description) return { ok: false, error: "Enter a product description." };
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.` };
  }

  if (form.category !== "Kurtas" && form.category !== "Sarees") {
    return { ok: false, error: "Choose Kurtas (Alankritha) or Sarees (Ayanaa)." };
  }
  const category: ProductCategory = form.category;
  const collection = COLLECTION_FOR_CATEGORY[category];
  if (form.collection !== collection) {
    return { ok: false, error: "Alankritha is for kurtas and Ayanaa is for sarees. Check the collection." };
  }
  if (!COLLECTION_STYLES[collection].includes(form.subcategory)) {
    return { ok: false, error: `Choose a style from the ${collection === "alankritha" ? "Alankritha" : "Ayanaa"} list.` };
  }

  const price = wholeRupees(form.price);
  if (price === null || price <= 0) return { ok: false, error: "Enter the price in whole rupees, more than 0." };
  if (price > MAX_PRICE) return { ok: false, error: "That price looks too high. Check it and try again." };

  let salePrice: number | undefined;
  if (form.salePrice.trim()) {
    const sale = wholeRupees(form.salePrice);
    if (sale === null || sale <= 0) return { ok: false, error: "Enter the sale price in whole rupees, or leave it empty." };
    if (sale >= price) return { ok: false, error: "The sale price must be lower than the price." };
    salePrice = sale;
  }

  // The main photo comes first; with no main photo, the first gallery photo takes its place
  const photos = [form.image, ...(form.additionalImages ?? [])].map((p) => p.trim()).filter(Boolean);
  const unique = Array.from(new Set(photos));
  if (unique.some((p) => !isAllowedImage(p))) {
    return { ok: false, error: "Use an image address starting with https:// or a site file starting with /images/." };
  }
  if (unique.length > MAX_PHOTOS) return { ok: false, error: `A product can have up to ${MAX_PHOTOS} photos.` };
  const [image = "", ...additionalImages] = unique;

  const sizeStock: Record<string, number> = {};
  for (const size of getSizeOptionsFor(category)) {
    const quantity = checkStockQuantity(form.sizeStock[size] ?? 0);
    if (!quantity.ok) return { ok: false, error: `${size === "Free Size" ? "Free Size" : `Size ${size}`}: ${quantity.error}` };
    sizeStock[size] = quantity.value;
  }

  if (form.status !== "enabled" && form.status !== "disabled") return { ok: false, error: "Choose whether the product is published." };

  return {
    ok: true,
    value: {
      name,
      description,
      collection,
      category,
      subcategory: form.subcategory,
      price,
      salePrice,
      image,
      additionalImages,
      isFeatured: Boolean(form.isFeatured),
      isNewArrival: Boolean(form.isNewArrival),
      status: form.status,
      sizeStock,
    },
  };
}

/** A new product id, created once per "Add product" form so a retried save can't make a duplicate */
export const newProductId = (): string =>
  `anv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
