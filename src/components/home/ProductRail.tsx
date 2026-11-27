import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Product } from "../../types";
import { productService } from "../../services/productService";
import ProductCard from "../ProductCard";
import SectionHeader from "./SectionHeader";
import { BackgroundMotif } from "../decor/Motifs";

// Catalogue views the product service already supports
const EDITS = ["Best Sellers", "New Arrivals", "Special Offers"] as const;
type Edit = (typeof EDITS)[number];

/**
 * Tabbed product carousel (best sellers, new arrivals, offers), filled from the
 * product catalogue. Native horizontal scrolling with snap points, so touch,
 * trackpad and the arrow buttons all move it smoothly.
 */
export default function ProductRail({
  onProductClick,
  onQuickView,
  onViewAll,
}: {
  onProductClick: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onViewAll: (category: string) => void;
}) {
  // Only edits that currently have pieces
  const edits = useMemo(
    () =>
      EDITS.map((edit) => ({ edit, products: productService.getProducts({ category: edit, sortBy: "newest" }) })).filter(
        (e) => e.products.length > 0
      ),
    []
  );
  const [active, setActive] = useState<Edit | undefined>(edits[0]?.edit);
  const trackRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const products = edits.find((e) => e.edit === active)?.products ?? [];

  const updateArrows = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  // Back to the start when the edit changes; re-check arrows on resize
  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 });
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [active]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  if (!active) return null;

  return (
    <section className="relative isolate overflow-hidden section-y" id="product-rail-section" aria-labelledby="product-rail-title">
      <BackgroundMotif kind="sprig" className="left-0 bottom-6 md:bottom-10 w-24 h-60 md:w-36 md:h-96" />
      <div className="relative container-page">
        <SectionHeader
          eyebrow="Shop the edit"
          title="The Anvaya Edit"
          id="product-rail-title"
          action={
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={() => scrollByPage(-1)}
                disabled={!canPrev}
                className="btn-icon rounded-xs border border-line-strong bg-surface"
                aria-label="Scroll products left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollByPage(1)}
                disabled={!canNext}
                className="btn-icon rounded-xs border border-line-strong bg-surface"
                aria-label="Scroll products right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          }
        />

        {/* Edit tabs + view all */}
        <div className="flex items-center justify-between gap-3 mb-6 border-b border-line">
          <div className="flex gap-3 sm:gap-7 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Product edits">
            {edits.map(({ edit, products: list }) => (
              <button
                key={edit}
                role="tab"
                aria-selected={active === edit}
                aria-controls="product-rail-track"
                onClick={() => setActive(edit)}
                className={`whitespace-nowrap pt-2 pb-3 text-2xs sm:text-sm font-semibold uppercase tracking-[0.1em] sm:tracking-[0.14em] border-b-2 transition-colors cursor-pointer ${
                  active === edit ? "border-maroon-800 text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {edit} <span className="hidden sm:inline font-normal text-muted tabular-nums">({list.length})</span>
              </button>
            ))}
          </div>
          <button onClick={() => onViewAll(active)} className="link text-xs shrink-0 pt-2 pb-3">
            View all
          </button>
        </div>

        <ul
          ref={trackRef}
          id="product-rail-track"
          role="tabpanel"
          onScroll={updateArrows}
          className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory overscroll-x-contain pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-px-4 sm:scroll-px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product) => (
            <li key={product.id} className="snap-start shrink-0 w-[46%] sm:w-[31%] lg:w-[calc(25%-0.75rem)]">
              <ProductCard product={product} variant="listing" onOpen={onProductClick} onQuickView={onQuickView} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
