import React, { Fragment, useState, useMemo } from "react";
import { Star, Filter, SlidersHorizontal, Search } from "lucide-react";
import { Product } from "../types";
import ProductCard from "./ProductCard";

interface ProductCatalogProps {
  products: Product[];
  selectedCategory: string;
  searchQuery: string;
  onProductClick: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onSelectCategory?: (category: string) => void;
}

export default function ProductCatalog({
  products,
  selectedCategory,
  searchQuery,
  onProductClick,
  onQuickView,
  onSelectCategory,
}: ProductCatalogProps) {
  // Filters & sorting state
  const [filterStockOnly, setFilterStockOnly] = useState<boolean>(false);
  const [selectedSize, setSelectedSize] = useState<string>("All"); // 'All', 'S', 'M', 'L', 'XL'
  const [priceRange, setPriceRange] = useState<string>("All"); // 'All', 'Under2000', '2000to4000', 'Over4000'
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<string>("newest"); // 'newest', 'price-low', 'price-high', 'name'

  // Extract subcategories for current category (strictly Kurtas and Sarees)
  const availableSubcategories = useMemo(() => {
    if (selectedCategory === "Kurtas") return ["Straight Fit", "A-Line", "Anarkali"];
    if (selectedCategory === "Sarees") return ["Banarasi Silk", "Organza", "Katan Silk"];
    return [];
  }, [selectedCategory]);

  // Reset subcategory if category changes
  useMemo(() => {
    setSelectedSubcategory("All");
  }, [selectedCategory]);

  // Apply filters
  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        // Category filter
        let matchesCategory = false;
        if (selectedCategory === "All") {
          matchesCategory = true;
        } else if (selectedCategory === "New Arrivals") {
          matchesCategory = !!product.isNewArrival;
        } else if (selectedCategory === "Best Sellers") {
          matchesCategory = !!product.isFeatured;
        } else if (selectedCategory === "Special Offers") {
          matchesCategory = product.salePrice !== undefined && product.salePrice > 0;
        } else if (selectedCategory === "Kurtas") {
          matchesCategory = product.category === "Kurtas";
        } else if (selectedCategory === "Sarees") {
          matchesCategory = product.category === "Sarees";
        } else {
          matchesCategory = product.category.toLowerCase() === selectedCategory.toLowerCase();
        }

        // Subcategory filter
        const matchesSubcategory =
          selectedSubcategory === "All" || product.subcategory === selectedSubcategory;

        // Size availability filter
        let matchesSize = true;
        if (selectedSize !== "All") {
          matchesSize = (product.sizeStock?.[selectedSize] || 0) > 0;
        }

        // In-stock toggle
        let matchesStock = true;
        if (filterStockOnly) {
          const totalStock = Object.values(product.sizeStock || {}).reduce((s, c) => s + c, 0);
          matchesStock = totalStock > 0;
        }

        // Price range filter
        let matchesPrice = true;
        const currentPrice = product.salePrice || product.price;
        if (priceRange === "Under2000") matchesPrice = currentPrice < 2000;
        else if (priceRange === "2000to4000") matchesPrice = currentPrice >= 2000 && currentPrice <= 4000;
        else if (priceRange === "Over4000") matchesPrice = currentPrice > 4000;

        // Search query
        let matchesSearch = true;
        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase();
          matchesSearch =
            product.name.toLowerCase().includes(q) ||
            product.description.toLowerCase().includes(q) ||
            product.category.toLowerCase().includes(q) ||
            (product.subcategory ? product.subcategory.toLowerCase().includes(q) : false);
        }

        return (
          matchesCategory &&
          matchesSubcategory &&
          matchesSize &&
          matchesStock &&
          matchesPrice &&
          matchesSearch
        );
      })
      .sort((a, b) => {
        if (sortBy === "price-low") {
          return (a.salePrice || a.price) - (b.salePrice || b.price);
        } else if (sortBy === "price-high") {
          return (b.salePrice || b.price) - (a.salePrice || a.price);
        } else if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        return 0; // default order
      });
  }, [
    products,
    selectedCategory,
    selectedSubcategory,
    selectedSize,
    filterStockOnly,
    priceRange,
    searchQuery,
    sortBy,
  ]);

  return (
    <section className="container-page section-y scroll-mt-24" id="product-catalog-section">
      {/* Category Tabs: Strictly Kurtas and Sarees */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between border-b border-line pb-5 mb-8 gap-4">
        <div>
          <span className="eyebrow block">
            ANVAYA CATALOGUE
          </span>
          <h2 className="heading-title mt-1">
            {selectedCategory === "All" ? "All Handcrafted Outfits" : selectedCategory}
          </h2>
        </div>

        {/* Quick Category Segmented Buttons */}
        <div className="segmented" role="tablist" aria-label="Collection">
          {["All", "Kurtas", "Sarees"].map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectCategory && onSelectCategory(cat)}
              role="tab"
              aria-selected={selectedCategory === cat}
              className="segmented-item"
            >
              {cat === "All" ? "All Outfits" : cat === "Kurtas" ? "Alankritha (Kurtas)" : "Ayanaa (Sarees)"}
            </button>
          ))}
        </div>
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="panel p-4 mb-8 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        {/* Subcategories (if applicable) */}
        {availableSubcategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="field-label mb-0 mr-1">Silhouette:</span>
            <button
              onClick={() => setSelectedSubcategory("All")}
              aria-pressed={selectedSubcategory === "All"}
              className="chip"
            >
              All
            </button>
            {availableSubcategories.map((sub) => (
              <button
                key={sub}
                onClick={() => setSelectedSubcategory(sub)}
                aria-pressed={selectedSubcategory === sub}
                className="chip"
              >
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* Controls: Size, Stock, Price, Sort */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Size Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="field-label mb-0">Size</span>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="field field-sm w-auto"
            >
              <option value="All">All Sizes</option>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
              <option value="XL">XL</option>
            </select>
          </div>

          {/* Price Range */}
          <div className="flex items-center gap-2 text-xs">
            <span className="field-label mb-0">Price</span>
            <select
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
              className="field field-sm w-auto"
            >
              <option value="All">All Prices</option>
              <option value="Under2000">Under ₹2,000</option>
              <option value="2000to4000">₹2,000 - ₹4,000</option>
              <option value="Over4000">Above ₹4,000</option>
            </select>
          </div>

          {/* In Stock Only Checkbox */}
          <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterStockOnly}
              onChange={(e) => setFilterStockOnly(e.target.checked)}
              className="checkbox"
            />
            <span>In Stock Only</span>
          </label>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="field field-sm w-auto ml-auto md:ml-0"
          >
            <option value="newest">Sort: Featured</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="name">Name: A to Z</option>
          </select>
        </div>
      </div>

      {/* Results Count & Active Filters Indicator */}
      <div className="flex items-center justify-between text-xs text-muted mb-6">
        <div>
          Showing <span className="font-semibold text-ink">{filteredProducts.length}</span> pieces
          {searchQuery && <span> matching "{searchQuery}"</span>}
        </div>
        {(selectedSubcategory !== "All" || selectedSize !== "All" || priceRange !== "All" || filterStockOnly) && (
          <button
            onClick={() => {
              setSelectedSubcategory("All");
              setSelectedSize("All");
              setPriceRange("All");
              setFilterStockOnly(false);
            }}
            className="link"
          >
            Clear active filters
          </button>
        )}
      </div>

      {/* Product Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="empty-state my-8">
          <h3 className="heading-card mb-2">No outfits match your criteria</h3>
          <p className="text-sm text-muted max-w-sm mx-auto mb-5">
            Try adjusting your filters or search query to browse available kurtas and sarees.
          </p>
          <button
            onClick={() => {
              setSelectedSubcategory("All");
              setSelectedSize("All");
              setPriceRange("All");
              setFilterStockOnly(false);
              if (onSelectCategory) onSelectCategory("All");
            }}
            className="btn btn-primary"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => (
            <Fragment key={product.id}>
              <ProductCard product={product} variant="catalogue" onOpen={onProductClick} onQuickView={onQuickView} />
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
