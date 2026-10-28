import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { Product } from "../types";
import { productService } from "../services/productService";
import { MOTION_TRANSITION, OVERLAY_MOTION } from "../utils/motion";
import ProductCard from "./ProductCard";

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
 * Results come straight from the in-memory product service.
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
  const inputRef = useRef<HTMLInputElement>(null);
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
    onClose();
    onOpenProduct(product);
  };

  const showingResults = trimmed.length > 0;
  const products = showingResults ? results : featured;

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
