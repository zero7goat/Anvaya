import React, { Fragment, useState, useMemo, useRef, useEffect, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, Grid3x3, LayoutGrid, Search, SlidersHorizontal, X } from "lucide-react";
import { Product, CollectionType } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";
import ProductCard from "./ProductCard";
import { BackgroundMotif } from "./decor/Motifs";
import { COLLECTION_STYLES } from "../utils/productRules";
import { formatINR } from "../utils/productDisplay";
import { OVERLAY_MOTION } from "../utils/motion";
import { useOverlay } from "../hooks/useOverlay";
import {
  CollectionFilters, FilterOptions, NO_FILTERS, applyCollectionFilters, countActiveFilters, getFilterOptions,
} from "../utils/collectionFilters";

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
type ListFilter = "types" | "sizes" | "colors" | "fabrics";

// Swatch shown beside each colour family in the filter
const COLOR_SWATCHES: Record<string, string> = {
  Red: "#b3261e",
  Pink: "#d63384",
  Orange: "#d9692a",
  Yellow: "#d4a017",
  Green: "#2f7d4f",
  Blue: "#2b5ea8",
  Purple: "#6f42c1",
  White: "#f8f6f0",
  Black: "#1c1c1c",
  Grey: "#8a8a8a",
  Beige: "#c8ad8d",
  Gold: "#c89d56",
};

/**
 * Collection landing page: compact collection heading, a filter column (a slide-in
 * drawer on small screens) and a toolbar with the result count, grid density and sort.
 * The collection's types (kurta cuts / saree weaves) are one of the filters.
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
  const styles = COLLECTION_STYLES[collectionKey];

  // Filtering & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<CollectionFilters>(() => ({
    ...NO_FILTERS,
    types: initialSubcategory && styles.includes(initialSubcategory) ? [initialSubcategory] : [],
  }));
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  // Presentation only: number of columns on wide screens, and the filter drawer on small screens
  const [density, setDensity] = useState<"comfortable" | "compact">("compact");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Every published product in this collection: the filter options come from these
  const collectionProducts = useMemo(
    () => productService.getProducts({ collection: collectionKey, includeDisabled: false }),
    [collectionKey]
  );
  const options = useMemo(
    () => getFilterOptions(collectionProducts, collectionKey, styles),
    [collectionProducts, collectionKey, styles]
  );

  // Search, availability and sort as before, then the filters (which keep the sorted order)
  const products = useMemo(() => {
    const searched = productService.getProducts({
      collection: collectionKey,
      includeDisabled: false,
      inStockOnly,
      searchQuery,
      sortBy,
    });
    return applyCollectionFilters(searched, filters);
  }, [collectionKey, inStockOnly, searchQuery, sortBy, filters]);

  const toggleOption = (key: ListFilter, value: string) =>
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter((v) => v !== value) : [...current[key], value],
    }));

  // Active filters, shown as removable chips above the grid
  const priceLabel =
    filters.priceMin !== null || filters.priceMax !== null
      ? `${formatINR(filters.priceMin ?? options.priceRange?.min ?? 0)} – ${formatINR(filters.priceMax ?? options.priceRange?.max ?? 0)}`
      : null;
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(["types", "sizes", "colors", "fabrics"] as ListFilter[]).flatMap((key) =>
      filters[key].map((value) => ({
        key: `${key}:${value}`,
        label: key === "sizes" ? `Size ${value}` : value,
        clear: () => toggleOption(key, value),
      }))
    ),
    ...(filters.minDiscount !== null
      ? [{ key: "discount", label: `${filters.minDiscount}% off or more`, clear: () => setFilters((f) => ({ ...f, minDiscount: null })) }]
      : []),
    ...(priceLabel
      ? [{ key: "price", label: priceLabel, clear: () => setFilters((f) => ({ ...f, priceMin: null, priceMax: null })) }]
      : []),
    ...(inStockOnly ? [{ key: "stock", label: "In stock", clear: () => setInStockOnly(false) }] : []),
    ...(searchQuery ? [{ key: "search", label: `“${searchQuery}”`, clear: () => setSearchQuery("") }] : []),
  ];
  const activeCount = countActiveFilters(filters) + (inStockOnly ? 1 : 0) + (searchQuery ? 1 : 0);

  const resetFilters = () => {
    setFilters(NO_FILTERS);
    setInStockOnly(false);
    setSearchQuery("");
  };

  const countText = `${products.length} ${products.length === 1 ? "piece" : "pieces"}`;

  // Filter controls, shown in the side column on wide screens and in the drawer otherwise
  const renderFilters = (idPrefix: string) => (
    <>
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

      <FilterSection title={collectionKey === "alankritha" ? "Kurta Type" : "Saree Type"}>
        <CheckboxList
          idPrefix={`${idPrefix}-type`}
          legend="Type"
          options={options.types}
          selected={filters.types}
          onToggle={(value) => toggleOption("types", value)}
        />
      </FilterSection>

      {options.priceRange && options.priceRange.max > options.priceRange.min && (
        <FilterSection title="Price">
          <PriceRange
            idPrefix={idPrefix}
            range={options.priceRange}
            min={filters.priceMin}
            max={filters.priceMax}
            onChange={(priceMin, priceMax) => setFilters((f) => ({ ...f, priceMin, priceMax }))}
          />
        </FilterSection>
      )}

      {options.sizes.length > 0 && (
        <FilterSection title="Size">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Size (in stock)">
            {options.sizes.map(({ value, count }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleOption("sizes", value)}
                aria-pressed={filters.sizes.includes(value)}
                disabled={count === 0 && !filters.sizes.includes(value)}
                aria-label={count === 0 ? `Size ${value}, none in stock` : `Size ${value}, ${count} in stock`}
                className="chip min-w-10 justify-center"
              >
                {value}
              </button>
            ))}
          </div>
          <p className="field-help">Shows pieces with the size in stock.</p>
        </FilterSection>
      )}

      {options.colors.length > 0 && (
        <FilterSection title="Colour">
          <CheckboxList
            idPrefix={`${idPrefix}-colour`}
            legend="Colour"
            options={options.colors}
            selected={filters.colors}
            onToggle={(value) => toggleOption("colors", value)}
            swatches={COLOR_SWATCHES}
          />
        </FilterSection>
      )}

      {options.fabrics.length > 0 && (
        <FilterSection title="Fabric">
          <CheckboxList
            idPrefix={`${idPrefix}-fabric`}
            legend="Fabric"
            options={options.fabrics}
            selected={filters.fabrics}
            onToggle={(value) => toggleOption("fabrics", value)}
          />
        </FilterSection>
      )}

      {options.discounts.length > 0 && (
        <FilterSection title="Discount">
          <fieldset className="space-y-2">
            <legend className="sr-only">Discount</legend>
            {[{ value: null as number | null, count: collectionProducts.length }, ...options.discounts].map(({ value, count }) => (
              <label key={value ?? "any"} className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer select-none">
                <input
                  type="radio"
                  name={`${idPrefix}-discount`}
                  checked={filters.minDiscount === value}
                  onChange={() => setFilters((f) => ({ ...f, minDiscount: value }))}
                  className="checkbox"
                />
                <span className="flex-1">{value === null ? "Any" : `${value}% off or more`}</span>
                {value !== null && <span className="text-muted tabular-nums">{count}</span>}
              </label>
            ))}
          </fieldset>
        </FilterSection>
      )}

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
      <header className="relative isolate overflow-hidden container-page pt-8 pb-6 sm:pt-10 sm:pb-8">
        <BackgroundMotif kind="paisley" className="right-2 md:right-6 lg:right-16 top-2 md:top-4 w-16 h-28 md:w-28 md:h-44 rotate-[20deg]" />
        <BackgroundMotif kind="mandala" className="right-20 md:right-40 lg:right-52 top-4 md:top-10 w-14 h-14 md:w-24 md:h-24" />
        <h1 className="heading-title sm:text-4xl">{collectionInfo.name}</h1>
        <span className="eyebrow block mt-1.5 tracking-[0.28em]">{collectionInfo.byline}</span>
        <p className="text-body mt-4 max-w-2xl">
          <span className="font-serif italic text-ink">{collectionInfo.tagline}.</span>{" "}
          {collectionInfo.description}
        </p>
      </header>

      <div className="container-page lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        {/* Filter column (wide screens) */}
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto overscroll-contain pr-1">
            <div className="flex items-center justify-between gap-2.5 pb-3 border-b border-line">
              <span className="flex items-center gap-2.5">
                <SlidersHorizontal className="w-4 h-4 text-ink-soft" aria-hidden="true" />
                <span className="eyebrow text-ink">Filter</span>
              </span>
              {activeCount > 0 && (
                <button type="button" onClick={resetFilters} className="link text-xs">
                  Clear all
                </button>
              )}
            </div>
            {renderFilters("desktop")}
          </div>
        </aside>

        <section aria-label={`${collectionInfo.name} products`} className="min-w-0">
          {/* Toolbar: filters (small screens), density, count, sort */}
          <div className="flex items-center gap-3 border-y border-line py-3">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-expanded={filtersOpen}
              aria-controls="collection-filters"
              aria-haspopup="dialog"
              className="btn btn-secondary btn-sm lg:hidden"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              Filters
              {activeCount > 0 && (
                <span className="badge badge-neutral tabular-nums" aria-label={`${activeCount} active`}>
                  {activeCount}
                </span>
              )}
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
              {activeCount > 0 && <span className="hidden sm:inline"> of {collectionProducts.length}</span>}
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

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={f.clear}
                  className="chip"
                  aria-label={`Remove filter ${f.label}`}
                >
                  {f.label}
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              ))}
              <button type="button" onClick={resetFilters} className="link text-xs ml-1">
                Clear all
              </button>
            </div>
          )}

          {/* Product Cards Grid */}
          {products.length === 0 ? (
            <div className="empty-state my-8">
              <h3 className="heading-card mb-2">No matching outfits found</h3>
              <p className="text-sm text-muted max-w-sm mx-auto mb-5">
                Try removing a filter or changing your search to see more pieces.
              </p>
              <button type="button" onClick={resetFilters} className="btn btn-primary">
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

      {/* Filter drawer (small screens): filters apply as they change; the footer shows the result */}
      <FilterDrawer
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={resetFilters}
        canReset={activeCount > 0}
        countText={countText}
      >
        {renderFilters("mobile")}
      </FilterDrawer>

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

// Multi-choice list (any ticked option matches), with each option's product count
function CheckboxList({
  idPrefix,
  legend,
  options,
  selected,
  onToggle,
  swatches,
}: {
  idPrefix: string;
  legend: string;
  options: FilterOptions["types"];
  selected: string[];
  onToggle: (value: string) => void;
  swatches?: Record<string, string>;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{legend}</legend>
      {options.map(({ value, count }) => {
        const id = `${idPrefix}-${value.replace(/\W+/g, "-").toLowerCase()}`;
        return (
          <div key={value} className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              id={id}
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
              className="checkbox"
            />
            <label htmlFor={id} className="flex-1 flex items-center gap-2 cursor-pointer select-none">
              {swatches?.[value] && (
                <span
                  className="w-3 h-3 rounded-full border border-line-strong shrink-0"
                  style={{ backgroundColor: swatches[value] }}
                  aria-hidden="true"
                />
              )}
              <span className="flex-1">{value}</span>
              <span className="text-muted tabular-nums">
                {count}
                <span className="sr-only"> {count === 1 ? "piece" : "pieces"}</span>
              </span>
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}

const PRICE_STEP = 100;

// Two-handle price slider over the collection's price range; reaching either end clears that limit
function PriceRange({
  idPrefix,
  range,
  min,
  max,
  onChange,
}: {
  idPrefix: string;
  range: { min: number; max: number };
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const low = Math.max(range.min, Math.min(min ?? range.min, range.max));
  const high = Math.min(range.max, Math.max(max ?? range.max, range.min));
  const span = range.max - range.min;
  const percent = (value: number) => ((value - range.min) / span) * 100;
  const limit = (value: number, edge: number) => (value === edge ? null : value);

  return (
    <div>
      <div className="range-dual">
        <div className="range-dual-track" />
        <div className="range-dual-fill" style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }} />
        <input
          id={`${idPrefix}-price-min`}
          type="range"
          min={range.min}
          max={range.max}
          step={PRICE_STEP}
          value={low}
          onChange={(e) => {
            const value = Math.min(Number(e.target.value), high);
            onChange(limit(value, range.min), limit(high, range.max));
          }}
          aria-label="Minimum price"
          aria-valuetext={formatINR(low)}
        />
        <input
          id={`${idPrefix}-price-max`}
          type="range"
          min={range.min}
          max={range.max}
          step={PRICE_STEP}
          value={high}
          onChange={(e) => {
            const value = Math.max(Number(e.target.value), low);
            onChange(limit(low, range.min), limit(value, range.max));
          }}
          aria-label="Maximum price"
          aria-valuetext={formatINR(high)}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-soft tabular-nums" aria-hidden="true">
        <span>{formatINR(low)}</span>
        <span>{formatINR(high)}</span>
      </div>
    </div>
  );
}

// Slide-in filter panel for small screens. Filters apply as they change; "Show" closes it.
function FilterDrawer({
  isOpen,
  onClose,
  onReset,
  canReset,
  countText,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  canReset: boolean;
  countText: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(isOpen, onClose, panelRef);

  // The filter column takes over from 1024px, so close the drawer (and its scroll lock) there
  useEffect(() => {
    if (!isOpen) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const onChange = () => wide.matches && onClose();
    onChange();
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="collection-filters" exit={{ pointerEvents: "none" }} className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <motion.div {...OVERLAY_MOTION.backdrop} className="overlay-backdrop" onClick={onClose} />
          <motion.div
            {...OVERLAY_MOTION.drawerRight}
            ref={panelRef}
            tabIndex={-1}
            id="collection-filters"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-filters-title"
            className="relative z-10 flex flex-col w-full max-w-[400px] h-full bg-surface text-ink shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 px-5 h-16 border-b border-line shrink-0">
              <h2 id="collection-filters-title" className="flex items-center gap-2.5 eyebrow text-ink">
                <SlidersHorizontal className="w-4 h-4 text-ink-soft" aria-hidden="true" />
                Filter
              </h2>
              <button type="button" onClick={onClose} aria-label="Close filters" className="btn-icon -mr-2">
                <X className="w-5 h-5" strokeWidth={1.6} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>

            <div className="flex gap-3 px-5 py-4 border-t border-line shrink-0">
              <button type="button" onClick={onReset} disabled={!canReset} className="btn btn-secondary flex-1">
                Clear all
              </button>
              <button type="button" onClick={onClose} className="btn btn-primary flex-1">
                Show {countText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
