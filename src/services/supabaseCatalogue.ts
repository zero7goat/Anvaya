/**
 * Reads the catalogue from Supabase (read-only).
 * Loaded on demand by productService.loadCatalogue(), only when the Supabase
 * env variables are set, so the client library stays out of the main bundle.
 */

import type { Product } from "../types";
import { supabase } from "../utils/supabase";
import { PRODUCT_COLUMNS, rowsToProducts } from "../utils/catalogueRows";

export async function fetchSupabaseCatalogue(signal: AbortSignal): Promise<Product[]> {
  // No automatic retries (they back off for several seconds while shoppers see "Loading…");
  // on any failure the site falls back to the built-in catalogue straight away
  const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).retry(false).abortSignal(signal);
  if (error) throw new Error(error.message);
  return rowsToProducts(data);
}
