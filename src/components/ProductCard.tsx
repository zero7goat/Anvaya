import { Product } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";
import {
  formatINR,
  getAvailableSizes,
  getCollectionKey,
  getDiscountPercent,
  getEffectivePrice,
  getProductPath,
  isPlainLeftClick,
} from "../utils/productDisplay";
import QuickViewButton from "./QuickViewButton";
import { useQuickAdd } from "./QuickAddToCart";
import ProductImage from "./ProductImage";
import { getProductImage } from "../data/imageRegistry";

interface ProductCardProps {
  product: Product;
  // "catalogue": homepage catalogue; "collection": similar products;
  // "listing": collection-page grid (image with the details directly beneath, no card panel)
  variant?: "catalogue" | "collection" | "listing";
  onOpen: (product: Product) => void;
  onQuickView: (product: Product) => void;
}

/**
 * Shared product card. The card is a real link to the product page (so it works
 * with the keyboard, middle-click and "open in new tab"); the quick-view eye
 * and quick-add buttons sit beside the link, never inside it, so they never trigger
 * each other. Hover effects (product-card-* in index.css) move the card, never scale it.
 */
export default function ProductCard({ product, variant = "catalogue", onOpen, onQuickView }: ProductCardProps) {
  const isAvailable = productService.getTotalStock(product) > 0;
  const discountPct = getDiscountPercent(product);
  const collectionName = BOUTIQUE_CONFIG.collections[getCollectionKey(product)].name;
  const quickAdd = useQuickAdd(product);

  // Quick view + quick add, stacked in the photo corner; the size picker covers the photo bottom
  const actions = (
    <>
      <div className="product-card-actions absolute top-2 right-2 z-10 flex flex-col gap-2">
        <QuickViewButton productName={product.name} onQuickView={() => onQuickView(product)} />
        {quickAdd.button}
      </div>
      <div className="absolute inset-x-0 top-0 aspect-[3/4] overflow-hidden pointer-events-none z-20">
        {quickAdd.picker}
      </div>
    </>
  );
  const hoverLayers = (
    <>
      <span className="product-card-shade" aria-hidden="true" />
      <span className="product-card-line" aria-hidden="true" />
    </>
  );

  const imageLabel = variant === "catalogue" ? collectionName : product.subcategory;
  const metaLabel =
    variant === "catalogue"
      ? `${product.category}${product.subcategory ? ` · ${product.subcategory}` : ""}`
      : `${collectionName} · ${product.category}`;

  if (variant === "listing") {
    const sizes = getAvailableSizes(product);
    return (
      <article className="product-card group relative flex flex-col">
        <a
          href={getProductPath(product.id)}
          onClick={(e) => {
            if (!isPlainLeftClick(e)) return;
            e.preventDefault();
            onOpen(product);
          }}
          className="flex flex-1 flex-col cursor-pointer focus-visible:outline-offset-2"
        >
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-muted">
            <ProductImage src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" />
            {hoverLayers}

            {!isAvailable && (
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                <span className="badge badge-overlay px-3 py-1">Sold Out</span>
              </div>
            )}

            {product.subcategory && (
              <div className="absolute bottom-2 left-2 badge badge-overlay">{product.subcategory}</div>
            )}
          </div>

          <div className="pt-3 flex-1 flex flex-col gap-1.5">
            <h3 className="text-sm leading-snug text-ink line-clamp-2 min-h-[2.75em] group-hover:text-maroon-600 transition-colors">
              {product.name}
            </h3>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="price text-sm">{formatINR(getEffectivePrice(product))}</span>
              {discountPct && (
                <>
                  <span className="price-was text-xs">{formatINR(product.price)}</span>
                  <span className="text-2xs font-semibold text-maroon-600">{discountPct}% off</span>
                </>
              )}
            </div>
            <p className="text-2xs text-muted truncate">
              {sizes.length === 0
                ? "Out of stock"
                : `Sizes: ${sizes.join(", ")}`}
            </p>
          </div>
        </a>

        {actions}
      </article>
    );
  }

  return (
    <article className="product-card group relative bg-surface overflow-hidden flex flex-col anvaya-card-hover">
      <a
        href={getProductPath(product.id)}
        onClick={(e) => {
          if (!isPlainLeftClick(e)) return;
          e.preventDefault();
          onOpen(product);
        }}
        className="flex flex-1 flex-col cursor-pointer focus-visible:-outline-offset-2"
      >
        {/* Image Section - Clean, borderless presentation */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-transparent">
          <ProductImage src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" />
          {hoverLayers}

          {/* Sold Out Overlay */}
          {!isAvailable && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center">
              <span className="badge badge-overlay px-3 py-1">
                Sold Out
              </span>
            </div>
          )}

          {/* Discount Badge */}
          {isAvailable && discountPct && (
            <div className="absolute top-2 left-2 badge badge-sale">
              {discountPct}% OFF
            </div>
          )}

          {imageLabel && (
            <div className="absolute bottom-2 left-2 badge badge-overlay backdrop-blur-xs">
              {imageLabel}
            </div>
          )}
        </div>

        {/* Information Section */}
        <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
          <div>
            <div className="eyebrow mb-1.5 truncate">
              {metaLabel}
            </div>

            <h3 className="text-sm sm:text-base leading-snug text-ink line-clamp-2 min-h-[2.75em] group-hover:text-maroon-600 transition-colors">
              {product.name}
            </h3>
          </div>

          {/* Price and availability wrap onto two lines when the card is narrow */}
          <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="price text-sm sm:text-base">
                {formatINR(getEffectivePrice(product))}
              </span>
              {discountPct && (
                <span className="price-was text-xs">
                  {formatINR(product.price)}
                </span>
              )}
            </div>

            {variant === "catalogue" ? (
              <span className={`text-2xs font-semibold ${isAvailable ? "text-success" : "text-muted"}`}>
                {isAvailable ? "In Stock" : "Sold Out"}
              </span>
            ) : (
              <span className="text-2xs text-muted whitespace-nowrap">
                {getAvailableSizes(product).join(", ") || "Out of stock"}
              </span>
            )}
          </div>
        </div>
      </a>

      {actions}
    </article>
  );
}
