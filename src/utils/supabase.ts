/**
 * Supabase client (prepared, not yet used by the storefront).
 *
 * The URL and publishable key come from .env.local and are bundled into the
 * browser once this file is imported, so table access must be protected with
 * Row Level Security. Never put a secret / service_role key in a VITE_ variable.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
