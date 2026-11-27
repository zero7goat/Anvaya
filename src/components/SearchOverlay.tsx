import { clearRecentSearches, loadRecentSearches, rememberSearch } from "../utils/recentSearches";
import { Fragment, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Search, Star, X } from "lucide-react";
import { Product } from "../types";
import { productService } from "../services/productService";
import { MOTION_TRANSITION, OVERLAY_MOTION } from "../utils/motion";
import ProductCard from "./ProductCard";
import ProductImage from "./ProductImage";
import { useQuickAdd } from "./QuickAddToCart";
import { useIsMobile } from "../hooks/useIsMobile";
import { getProductImage } from "../data/imageRegistry";
import {
  formatINR,
  getDiscountPercent,
  getEffectivePrice,
  getProductPath,
  isPlainLeftClick,
} from "../utils/productDisplay";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProduct: (product: Product) => void;
  onQuickView: (product: Product) => void;
}

// Number of featured pieces shown before the visitor types
const FEATURED_LIMIT = 8;

/**
 * Full-screen product search opened from the header: a search field across the top,
 * suggested searches beside the results, and featured pieces until something is typed.
 * Results come straight from the in-memory product service. Phones get their own
 * layout (MobileSearchPanel): back arrow + rounded field, Top Searches pills, and the
 * shop's best sellers (its featured pieces) in an edge-to-edge grid.
 */
export default function SearchOverlay({ isOpen, onClose, onOpenProduct, onQuickView }: SearchOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <Fragment key="search-overlay">
          <SearchPanel onClose={onClose} onOpenProduct={onOpenProduct} onQuickView={onQuickView} />
        </Fragment>
      )}
    </AnimatePresence>
  );
}

function SearchPanel({ onClose, onOpenProduct, onQuickView }: Omit<SearchOverlayProps, "isOpen">) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(loadRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const trimmed = query.trim();

  // Suggestions are the shop's own categories and styles, kept only when they return pieces
  const suggestions = useMemo(() => {
    const live = productService.getProducts({ includeDisabled: false });
    const candidates = ["Sarees", "Kurtas", "Silk", ...live.map((p) => p.subcategory || "")];
    return [...new Set(candidates)].filter(
      (term) => term && productService.getProducts({ includeDisabled: false, searchQuery: term }).length > 0
    );
  }, []);

  const featured = useMemo(() => {
    const live = productService.getProducts({ includeDisabled: false, sortBy: "newest" });
    const picks = live.filter((p) => p.isFeatured);
    return (picks.length ? picks : live).slice(0, FEATURED_LIMIT);
  }, []);

  const results = useMemo(
    () => (trimmed ? productService.getProducts({ includeDisabled: false, searchQuery: trimmed }) : []),
    [trimmed]
  );

  // Focus the field, lock page scroll, close on Escape, and restore focus on close
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A quick view opened from the results handles its own Escape first
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, []);

  const applySuggestion = (term: string) => {
    setQuery(term);
    inputRef.current?.focus({ preventScroll: true });
  };

  const openProduct = (product: Product) => {
    // Opening a piece from the results remembers what was searched
    if (trimmed) setRecent(rememberSearch(trimmed));
    onClose();
    onOpenProduct(product);
  };

  // The shopper's own recent searches, above the shop's suggestions
  const recentSearches = recent.length > 0 && (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h2 className="eyebrow text-ink">Recent searches</h2>
        <button
          type="button"
          onClick={() => {
            clearRecentSearches();
            setRecent([]);
          }}
          className="link text-xs"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {recent.map((term) => (
          <button key={term} type="button" onClick={() => applySuggestion(term)} className="chip whitespace-nowrap">
            {term}
          </button>
        ))}
      </div>
    </div>
  );

  const showingResults = trimmed.length > 0;
  const products = showingResults ? results : featured;

  if (isMobile) {
    return (
      <motion.div
        {...OVERLAY_MOTION.backdrop}
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        className="fixed inset-0 z-50 bg-surface text-ink flex flex-col font-sans"
        id="search-overlay"
      >
        {/* Back + rounded search field */}
        <form role="search" onSubmit={(e) => e.preventDefault()} className="flex items-center gap-1 px-2 pt-2 pb-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-icon shrink-0" aria-label="Close search" id="search-overlay-close">
            <ArrowLeft className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2 h-11 px-3 rounded-sm bg-surface-muted">
            <Search className="w-[18px] h-[18px] text-muted shrink-0" aria-hidden="true" />
            <label htmlFor="search-overlay-input" className="sr-only">
              Search products
            </label>
            <input
              ref={inputRef}
              id="search-overlay-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for products..."
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className="flex-1 min-w-0 bg-transparent text-base text-ink placeholder:text-muted/70 outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" onClick={() => applySuggestion("")} aria-label="Clear search" className="p-1 text-muted">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Recent, then top searches */}
          <section className="px-3 pt-3 pb-5" aria-labelledby="search-suggestions-title">
            {recentSearches}
            <h2 id="search-suggestions-title" className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-muted mb-3">
              Top searches
            </h2>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => applySuggestion(term)}
                  aria-pressed={trimmed.toLowerCase() === term.toLowerCase()}
                  className={`h-9 px-3.5 rounded-full border text-xs font-medium uppercase tracking-[0.04em] cursor-pointer transition-colors ${
                    trimmed.toLowerCase() === term.toLowerCase()
                      ? "bg-maroon-700 border-maroon-700 text-white"
                      : "border-maroon-700/70 text-ink/80 hover:bg-maroon-700/5"
                  }`}
                >
                  {term}
                </button>
              ))}
            </div>
          </section>

          {/* Best sellers, or results once something is typed */}
          <section aria-labelledby="search-results-title" className="pb-6">
            <h2 id="search-results-title" className="font-sans text-center text-base font-bold uppercase tracking-[0.06em] text-ink/80 mb-4 px-3">
              {showingResults ? `Results for “${trimmed}”` : "Our Bestsellers"}
            </h2>
            {showingResults && (
              <p className="text-center text-xs text-muted -mt-3 mb-4" aria-live="polite">
                {results.length} {results.length === 1 ? "piece" : "pieces"}
              </p>
            )}
            {products.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-semibold mb-1">No pieces match “{trimmed}”</p>
                <p className="text-sm text-muted">Check the spelling, or try one of the top searches.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-0.5">
                {products.map((product) => (
                  <Fragment key={product.id}>
                    <MobileSearchCard product={product} onOpen={openProduct} />
                  </Fragment>
                ))}
              </div>
            )}
          </section>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      {...OVERLAY_MOTION.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Search products"
      className="fixed inset-0 z-50 bg-canvas text-ink flex flex-col font-sans"
      id="search-overlay"
    >
      {/* Search field */}
      <div className="border-b border-line bg-surface shrink-0">
        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="container-page flex items-center gap-3 h-16 sm:h-20"
        >
          <Search className="w-5 h-5 text-muted shrink-0" aria-hidden="true" />
          <label htmlFor="search-overlay-input" className="sr-only">
            Search products
          </label>
          <input
            ref={inputRef}
            id="search-overlay-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search kurtas, sarees, silks..."
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="flex-1 min-w-0 bg-transparent text-base sm:text-lg text-ink placeholder:text-muted outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => applySuggestion("")} className="link text-xs shrink-0">
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-icon shrink-0" aria-label="Close search" id="search-overlay-close">
            <X className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Suggestions + products; only this area scrolls */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITION.base }}
          className="container-page lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 py-6 sm:py-8"
        >
          <aside className="mb-7 lg:mb-0 lg:border-r lg:border-line lg:pr-8" aria-labelledby="search-suggestions-title">
            {recentSearches}
            <h2 id="search-suggestions-title" className="eyebrow text-ink mb-3 lg:mb-4">
              Popular searches
            </h2>
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto lg:overflow-visible">
              <div className="flex gap-2 w-max sm:w-auto sm:flex-wrap pb-1">
                {suggestions.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => applySuggestion(term)}
                    aria-pressed={trimmed.toLowerCase() === term.toLowerCase()}
                    className="chip whitespace-nowrap"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section aria-labelledby="search-results-title" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 mb-5">
              <h2 id="search-results-title" className="eyebrow text-ink truncate">
                {showingResults ? `Results for “${trimmed}”` : "Featured pieces"}
              </h2>
              {showingResults && (
                <span className="text-xs text-muted shrink-0" aria-live="polite">
                  <span className="font-semibold text-ink tabular-nums">{results.length}</span>{" "}
                  {results.length === 1 ? "piece" : "pieces"}
                </span>
              )}
            </div>

            {products.length === 0 ? (
              <div className="empty-state">
                <h3 className="heading-card mb-2">No pieces match “{trimmed}”</h3>
                <p className="text-sm text-muted max-w-sm mx-auto">
                  Check the spelling, or try one of the popular searches.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-4">
                {products.map((product) => (
                  <Fragment key={product.id}>
                    <ProductCard product={product} variant="listing" onOpen={openProduct} onQuickView={onQuickView} />
                  </Fragment>
                ))}
              </div>
            )}
          </section>
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Phone search result card: edge-to-edge photo with a Bestseller ribbon (the shop's
 * featured pieces) and the review rating, then name, prices and a solid quick-add bag.
 */
function MobileSearchCard({ product, onOpen }: { product: Product; onOpen: (product: Product) => void }) {
  const quickAdd = useQuickAdd(product, { solid: true });
  const discountPct = getDiscountPercent(product);
  const isAvailable = productService.getTotalStock(product) > 0;
  const reviewCount = product.reviews?.length || 0;
  const avgRating = reviewCount ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;
  const open = (e: MouseEvent) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    onOpen(product);
  };

  return (
    <article className="flex flex-col bg-surface">
      <div className="relative">
        <a href={getProductPath(product.id)} onClick={open} className="block relative aspect-[3/4] overflow-hidden bg-surface-muted">
          <ProductImage
            src={getProductImage(product)}
            alt={product.name}
            className="w-full h-full object-cover"
            sizes="50vw"
          />
          {!isAvailable && (
            <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
              <span className="badge badge-overlay px-3 py-1">Sold Out</span>
            </div>
          )}
          {product.isFeatured && (
            <span
              className="absolute left-0 bottom-2 pl-1.5 pr-4 py-0.5 text-2xs font-bold italic tracking-[0.06em] text-maroon-950 bg-gradient-to-r from-gold-500 to-gold-300 [clip-path:polygon(0_0,100%_0,88%_50%,100%_100%,0_100%)]"
            >
              BESTSELLER
            </span>
          )}
          {reviewCount > 0 && (
            <span className="absolute right-1.5 bottom-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-xs bg-white/90 text-2xs font-semibold text-ink">
              {avgRating.toFixed(1)}
              <Star className="w-2.5 h-2.5 fill-success text-success" aria-hidden="true" />
            </span>
          )}
        </a>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">{quickAdd.picker}</div>
      </div>

      <div className="flex items-start gap-2 px-1.5 pt-2 pb-3">
        <a href={getProductPath(product.id)} onClick={open} className="flex-1 min-w-0">
          <h3 className="font-sans text-sm leading-snug text-ink line-clamp-2">{product.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs">
            {discountPct && <span className="text-muted line-through">{formatINR(product.price)}</span>}
            <span className="text-sm font-semibold text-ink">{formatINR(getEffectivePrice(product))}</span>
            {discountPct && <span className="font-semibold text-maroon-600">{discountPct}% OFF</span>}
          </p>
        </a>
        {quickAdd.button}
      </div>
    </article>
  );
}
