import type { Product } from "../types";

type Searchable = Pick<Product, "id" | "name" | "collection">;

/**
 * Inventory search: matches the product name, product id (the catalogue has no separate
 * SKU) or collection (alankritha / ayanaa, which are also the collections' display names),
 * ignoring case and surrounding spaces. An empty search shows everything.
 */
export function filterInventory<T extends Searchable>(products: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return products;
  return products.filter((p) => [p.name, p.id, p.collection ?? ""].some((value) => value.toLowerCase().includes(q)));
}
