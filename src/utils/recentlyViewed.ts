// Product IDs the shopper opened, newest first, kept only in this browser
const STORAGE_KEY = "anvaya_recently_viewed";
export const RECENTLY_VIEWED_LIMIT = 8;

export function getRecentlyViewedIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // Storage blocked (private mode, disabled site data) or unreadable
    return [];
  }
}

// Moves the product to the front, without duplicates, keeping the latest few
export function recordRecentlyViewed(productId: string): void {
  const ids = [productId, ...getRecentlyViewedIds().filter((id) => id !== productId)].slice(0, RECENTLY_VIEWED_LIMIT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: the section simply stays empty
  }
}
