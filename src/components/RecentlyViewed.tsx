import { useEffect, useState } from "react";
import { Product } from "../types";
import { getRecentlyViewedIds, recordRecentlyViewed } from "../utils/recentlyViewed";
import ProductCard from "./ProductCard";

/**
 * Product-page section listing the pieces this shopper opened before (stored in this
 * browser only). The current product is recorded on arrival and never listed itself.
 * Phones and tablets swipe through a snap carousel; wide screens show a grid.
 */
export default function RecentlyViewed({
  currentProductId,
  products,
  onOpenProduct,
  onQuickView,
}: {
  currentProductId: string;
  // Live, published storefront products, so removed or hidden pieces drop out
  products: Product[];
  onOpenProduct: (product: Product) => void;
  onQuickView: (product: Product) => void;
}) {
  // Read once per product, before this visit is recorded
  const [ids, setIds] = useState<string[]>(() => getRecentlyViewedIds());

  useEffect(() => {
    setIds(getRecentlyViewedIds());
    recordRecentlyViewed(currentProductId);
  }, [currentProductId]);

  const viewed = ids
    .filter((id) => id !== currentProductId)
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => !!p);

  if (viewed.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-heading" className="mt-16 sm:mt-20 pt-10 border-t border-line" id="recently-viewed">
      <h2 id="recently-viewed-heading" className="heading-card mb-6">
        Recently Viewed
      </h2>
      <ul
        className="-mx-4 px-4 sm:-mx-6 sm:px-6 flex gap-3 sm:gap-5 overflow-x-auto snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 overscroll-x-contain -mt-2 pt-2 pb-3 [scrollbar-width:thin] lg:mx-0 lg:px-0 lg:mt-0 lg:pt-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:pb-0"
        aria-label="Pieces you viewed recently"
      >
        {viewed.map((p) => (
          <li key={p.id} className="snap-start shrink-0 w-[46%] min-[480px]:w-[38%] sm:w-[30%] md:w-[26%] lg:w-auto">
            <ProductCard product={p} variant="collection" onOpen={onOpenProduct} onQuickView={onQuickView} />
          </li>
        ))}
      </ul>
    </section>
  );
}
