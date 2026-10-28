/**
 * True when the Supabase URL and publishable key are set (see .env.example).
 * Kept apart from ./supabase.ts, which needs both values, so callers can check
 * first and load the client only when it can be created.
 */
export const isSupabaseConfigured = (): boolean => {
  const env = import.meta.env;
  return Boolean(env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_PUBLISHABLE_KEY);
};
