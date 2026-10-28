/**
 * Reads the catalogue from Supabase (read-only).
 * Loaded on demand by productService.loadCatalogue(), only when the Supabase
 * env variables are set, so the client library stays out of the main bundle.
 */

import type { Product } from "../types";
import { supabase } from "../utils/supabase";
import { PRODUCT_COLUMNS, rowsToProducts } from "../utils/catalogueRows";

export async function fetchSupabaseCatalogue(signal: AbortSignal): Promise<Product[]> {
  const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).abortSignal(signal);
  if (error) throw new Error(error.message);
  return rowsToProducts(data);
}
