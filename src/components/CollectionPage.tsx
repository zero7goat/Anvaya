import React, { Fragment, useState, useMemo, ReactNode } from "react";
import { ChevronDown, ChevronRight, Grid3x3, LayoutGrid, Search, SlidersHorizontal, X } from "lucide-react";
import { Product, CollectionType } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";
import ProductCard from "./ProductCard";
import { CLOTHING_SIZES } from "../utils/productDisplay";
import { BackgroundMotif } from "./decor/Motifs";

interface CollectionPageProps {
  collectionKey: CollectionType;
  // Style to select when the page opens (e.g. from a footer style link)
  initialSubcategory?: string;
  onProductClick: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onReturnHome: () => void;
  onNavigateCollection: (collection: CollectionType) => void;
}

type SortOption = "newest" | "price-asc" | "price-desc" | "name";

/**
 * Collection landing page: compact collection heading, a filter column (a toggled
 * panel on small screens), style chips above the grid, and a toolbar with the
 * result count, grid density and sort.
 */
export default function CollectionPage({
  collectionKey,
  initialSubcategory,
  onProductClick,
  onQuickView,
  onReturnHome,
  onNavigateCollection,
}: CollectionPageProps) {
  const collectionInfo = BOUTIQUE_CONFIG.collections[collectionKey];
  const otherCollectionKey: CollectionType = collectionKey === "alankritha" ? "ayanaa" : "alankritha";
  const otherCollectionInfo = BOUTIQUE_CONFIG.collections[otherCollectionKey];

  // Filtering & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState(initialSubcategory || "All");
  const [selectedSize, setSelectedSize] = useState("All");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  // Presentation only: number of columns on wide screens, and the filter panel on small screens
  const [density, setDensity] = useState<"comfortable" | "compact">("compact");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Subcategories available based on collection
  const subcategories = useMemo(() => {
    if (collectionKey === "alankritha") {
      return ["All", "Straight Fit", "A-Line", "Anarkali"];
    } else {
      return ["All", "Banarasi Silk", "Organza", "Katan Silk"];
    }
  }, [collectionKey]);

  // Size filter options (the same for both collections)
  const availableSizes = ["All", ...CLOTHING_SIZES];

  // Query products strictly for this collection
  const products = useMemo(() => {
    return productService.getProducts({
      collection: collectionKey,
      includeDisabled: false,
      subcategory: selectedSubcategory !== "All" ? selectedSubcategory : undefined,
      selectedSize: selectedSize !== "All" ? selectedSize : undefined,
      inStockOnly,
      searchQuery,
      sortBy,
    });
  }, [collectionKey, selectedSubcategory, selectedSize, inStockOnly, searchQuery, sortBy]);


  // Active filters, shown as removable chips above the grid
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(selectedSubcategory !== "All"
      ? [{ key: "style", label: selectedSubcategory, clear: () => setSelectedSubcategory("All") }]
      : []),
    ...(selectedSize !== "All"
      ? [{ key: "size", label: `Size ${selectedSize}`, clear: () => setSelectedSize("All") }]
      : []),
    ...(inStockOnly ? [{ key: "stock", label: "In stock", clear: () => setInStockOnly(false) }] : []),
    ...(searchQuery ? [{ key: "search", label: `“${searchQuery}”`, clear: () => setSearchQuery("") }] : []),
  ];

  const resetFilters = () => {
    setSelectedSubcategory("All");
    setSelectedSize("All");
    setInStockOnly(false);
    setSearchQuery("");
  };

  // Filter controls, shown in the side column on wide screens and in a toggled panel below the toolbar otherwise
  const renderFilters = (idPrefix: string) => (
    <>
      <div className="flex items-center gap-2.5 pb-3 border-b border-line">
        <SlidersHorizontal className="w-4 h-4 text-ink-soft" aria-hidden="true" />
        <span className="eyebrow text-ink">Filter</span>
      </div>

      {/* Search */}
      <div className="relative py-4 border-b border-line">
        <label htmlFor={`${idPrefix}-collection-search`} className="sr-only">
          Search {collectionInfo.name}
        </label>
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id={`${idPrefix}-collection-search`}
          type="search"
          placeholder={`Search ${collectionInfo.name}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="field field-sm pl-8"
        />
      </div>

      <FilterSection title="Size">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Size">
          {availableSizes.map((sz) => (
            <button
              key={sz}
              onClick={() => setSelectedSize(sz)}
              aria-pressed={selectedSize === sz}
              className="chip min-w-10 justify-center"
            >
              {sz}
            </button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Availability">
        <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
            className="checkbox"
          />
          <span>In stock only</span>
        </label>
      </FilterSection>
    </>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink pb-24">
      {/* Breadcrumb + collection switch */}
      <div className="bg-surface border-b border-line py-3">
        <div className="container-page flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumb">
              <li>
                <button onClick={onReturnHome}>Home</button>
              </li>
              <li className="flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="text-ink" aria-current="page">{collectionInfo.name}</span>
              </li>
            </ol>
          </nav>

          <div className="segmented text-xs" role="tablist" aria-label="Collection">
            <button
              onClick={() => onNavigateCollection("alankritha")}
              role="tab"
              aria-selected={collectionKey === "alankritha"}
              className="segmented-item"
            >
              Alankritha (Kurtas)
            </button>
            <button
              onClick={() => onNavigateCollection("ayanaa")}
              role="tab"
              aria-selected={collectionKey === "ayanaa"}
              className="segmented-item"
            >
              Ayanaa (Sarees)
            </button>
          </div>
        </div>
      </div>

      {/* Collection heading: name, with "By Anvaya" directly beneath */}
      <header className="relative isolate container-page pt-8 pb-6 sm:pt-10 sm:pb-8">
        <BackgroundMotif kind="paisley" className="right-2 md:right-6 lg:right-16 top-2 md:top-4 w-16 h-28 md:w-28 md:h-44 rotate-[20deg]" />
        <BackgroundMotif kind="mandala" className="right-20 md:right-40 lg:right-52 top-4 md:top-10 w-14 h-14 md:w-24 md:h-24" />
        <h1 className="heading-title sm:text-4xl">{collectionInfo.name}</h1>
        <span className="eyebrow block mt-1.5 tracking-[0.28em]">{collectionInfo.byline}</span>
        <p className="text-body mt-4 max-w-2xl">
          <span className="font-serif italic text-ink">{collectionInfo.tagline}.</span>{" "}
          {collectionInfo.description}
        </p>
      </header>

      <div className="container-page lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        {/* Filter column (wide screens) */}
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="lg:sticky lg:top-32">{renderFilters("desktop")}</div>
        </aside>

        <section aria-label={`${collectionInfo.name} products`} className="min-w-0">
          {/* Style chips: the collection's own styles only */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto overscroll-x-contain">
            <div className="flex gap-2 pb-1 w-max sm:w-auto sm:flex-wrap" role="group" aria-label="Style">
              {subcategories.map((sub) => (
                <button
                  key={sub}
                  onClick={() => setSelectedSubcategory(sub)}
                  aria-pressed={selectedSubcategory === sub}
                  className="chip whitespace-nowrap"
                >
                  {sub === "All" ? `All ${collectionInfo.category}` : sub}
                </button>
              ))}
            </div>
          </div>

          {/* Toolbar: filters toggle (small screens), density, count, sort */}
          <div className="mt-4 flex items-center gap-3 border-y border-line py-3">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="collection-filters"
              className="btn btn-secondary btn-sm lg:hidden"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              Filters{activeFilters.length > 0 && ` (${activeFilters.length})`}
            </button>

            <div className="hidden md:flex items-center gap-1" role="group" aria-label="Grid density">
              <button
                type="button"
                onClick={() => setDensity("comfortable")}
                aria-pressed={density === "comfortable"}
                aria-label="Larger images"
                className={`btn-icon rounded-xs ${density === "comfortable" ? "text-ink" : "text-muted"}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDensity("compact")}
                aria-pressed={density === "compact"}
                aria-label="More products per row"
                className={`btn-icon rounded-xs ${density === "compact" ? "text-ink" : "text-muted"}`}
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs text-muted" aria-live="polite">
              <span className="font-semibold text-ink tabular-nums">{products.length}</span>{" "}
              {products.length === 1 ? "piece" : "pieces"}
            </span>

            <label className="ml-auto flex items-center gap-2">
              <span className="field-label mb-0 hidden sm:inline">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="field field-sm w-auto"
                aria-label="Sort products"
              >
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name">Name: A-Z</option>
              </select>
            </label>
          </div>

          {/* Filter panel (small screens), opened from the toolbar */}
          {filtersOpen && (
            <div id="collection-filters" role="region" aria-label="Filters" className="panel p-4 mt-3 lg:hidden">
              {renderFilters("mobile")}
            </div>
          )}

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={f.clear}
                  className="chip"
                  aria-label={`Remove filter ${f.label}`}
                >
                  {f.label}
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              ))}
              <button onClick={resetFilters} className="link text-xs ml-1">
                Clear all
              </button>
            </div>
          )}

          {/* Product Cards Grid */}
          {products.length === 0 ? (
            <div className="empty-state my-8">
              <h3 className="heading-card mb-2">No matching outfits found</h3>
              <p className="text-sm text-muted max-w-sm mx-auto mb-5">
                Try adjusting your search query, style filter, or size selection to view available pieces.
              </p>
              <button onClick={resetFilters} className="btn btn-primary">
                Clear Filters
              </button>
            </div>
          ) : (
            <div
              className={`mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 ${
                density === "compact" ? "md:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {products.map((product) => (
                <Fragment key={product.id}>
                  <ProductCard product={product} variant="listing" onOpen={onProductClick} onQuickView={onQuickView} />
                </Fragment>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Sister Collection Referral Banner */}
      <div className="container-page">
        <div className="mt-16 panel-muted p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <span className="eyebrow block mb-2">
              Discover Anvaya's Sister Collection
            </span>
            <h4 className="heading-card">
              {otherCollectionInfo.name} — {otherCollectionInfo.tagline}
            </h4>
            <p className="text-body mt-1">
              {otherCollectionInfo.description}
            </p>
          </div>
          <button
            onClick={() => onNavigateCollection(otherCollectionKey)}
            className="btn btn-primary shrink-0"
          >
            Explore {otherCollectionInfo.name} →
          </button>
        </div>
      </div>
    </div>
  );
}

// Collapsible filter group (native <details>, so it works with the keyboard and screen readers)
function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="group border-b border-line">
      <summary className="flex items-center justify-between py-3.5 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        <span className="eyebrow text-ink">{title}</span>
        <ChevronDown className="w-4 h-4 text-muted transition-transform duration-300 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}
