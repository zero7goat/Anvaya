/**
 * Which page a URL shows. Every address the site links to is listed here; anything else
 * is "not_found", so a mistyped or outdated link shows the 404 page instead of quietly
 * showing the homepage.
 *
 *   /                                         homepage
 *   /collection/alankritha, /collection/ayanaa
 *   /product/:id                              (an unknown id shows "Product not found")
 *   /admin                                    (and anything under /admin/)
 *   /shipping-and-returns, /terms-and-conditions, /privacy-policy
 *
 * Older links used hash routes on the homepage (#/product/:id, #/collection/..., #/admin);
 * they still work. A trailing slash is ignored.
 */
export type PolicyView = "policy_shipping" | "policy_terms" | "policy_privacy";
export type ViewState = "store" | "collection_alankritha" | "collection_ayanaa" | "product" | "admin" | "not_found" | PolicyView;

export const POLICY_LINKS: { view: PolicyView; path: string; label: string }[] = [
  { view: "policy_shipping", path: "/shipping-and-returns", label: "Shipping & Returns" },
  { view: "policy_terms", path: "/terms-and-conditions", label: "Terms & Conditions" },
  { view: "policy_privacy", path: "/privacy-policy", label: "Privacy Policy" },
];

export interface Route {
  view: ViewState;
  productId: string | null;
}

const page = (view: ViewState): Route => ({ view, productId: null });
const NOT_FOUND = page("not_found");

const productRoute = (encodedId: string): Route => {
  try {
    return { view: "product", productId: decodeURIComponent(encodedId) };
  } catch {
    return NOT_FOUND; // malformed %-escape
  }
};

export function resolveRoute(pathname: string, hash: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";

  const product = path.match(/^\/product\/([^/]+)$/);
  if (product) return productRoute(product[1]);
  if (path === "/admin" || path.startsWith("/admin/")) return page("admin");
  if (path === "/collection/alankritha") return page("collection_alankritha");
  if (path === "/collection/ayanaa") return page("collection_ayanaa");
  const policy = POLICY_LINKS.find((link) => link.path === path);
  if (policy) return page(policy.view);
  if (path !== "/"&& path !== "/index.html") return NOT_FOUND;

  // Homepage, or an older hash link to another page
  const hashProduct = hash.match(/^#\/product\/([^/]+)\/?$/);
  if (hashProduct) return productRoute(hashProduct[1]);
  if (hash.startsWith("#/admin") || hash.startsWith("#admin")) return page("admin");
  if (/^#\/collection\/alankritha\/?$/.test(hash)) return page("collection_alankritha");
  if (/^#\/collection\/ayanaa\/?$/.test(hash)) return page("collection_ayanaa");
  return page("store"); // including in-page anchors such as #product-catalog-section
}
