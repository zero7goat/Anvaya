/**
 * The shopper's last few searches, kept in their own browser only (never sent anywhere),
 * so the search screen can offer them again. A search is remembered when a piece is opened
 * from its results. Storage can be unavailable (private browsing); then nothing is kept.
 */

const STORAGE_KEY = "anvaya_recent_searches";
const MAX_RECENT = 5;

export function loadRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string" && t.trim() !== "").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Puts a term first (once, ignoring case) and returns the new list */
export function rememberSearch(term: string): string[] {
  const clean = term.trim().slice(0, 60);
  if (!clean) return loadRecentSearches();
  const next = [clean, ...loadRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not saved; the search still works
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
}
