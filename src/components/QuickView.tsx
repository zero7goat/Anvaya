import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowRight, X } from "lucide-react";
import { Product } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";
import { OVERLAY_MOTION } from "../utils/motion";
import ProductImage from "./ProductImage";
import { getProductImage } from "../data/imageRegistry";
import {
  formatINR,
  getCollectionKey,
  getDiscountPercent,
  getEffectivePrice,
  getProductPath,
  getSizeOptions,
  isPlainLeftClick,
} from "../utils/productDisplay";

interface QuickViewProps {
  // The product to preview; null when closed
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, size: string, quantity: number) => void;
  onViewFullDetails: (product: Product) => void;
}

/**
 * Compact quick-view dialog opened from a product card's eye button.
 * Square-cornered, closes on Escape / backdrop / close button, and returns
 * keyboard focus to whatever opened it.
 */
export default function QuickView({ product, onClose, onAddToCart, onViewFullDetails }: QuickViewProps) {
  return (
    <AnimatePresence>
      {product && (
        <Fragment key={product.id}>
          <QuickViewDialog
            product={product}
            onClose={onClose}
            onAddToCart={onAddToCart}
            onViewFullDetails={onViewFullDetails}
          />
        </Fragment>
      )}
    </AnimatePresence>
  );
}

function QuickViewDialog({
  product,
  onClose,
  onAddToCart,
  onViewFullDetails,
}: Omit<QuickViewProps, "product"> & { product: Product }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const collection = BOUTIQUE_CONFIG.collections[getCollectionKey(product)];
  const sizes = getSizeOptions(product);
  // One-size pieces (sarees) start with Free Size chosen when it is in stock
  const [selectedSize, setSelectedSize] = useState(() =>
    sizes.length === 1 && (product.sizeStock[sizes[0]] || 0) > 0 ? sizes[0] : ""
  );
  const isOutOfStock = productService.getTotalStock(product) === 0;
  const selectedStock = selectedSize ? product.sizeStock[selectedSize] || 0 : 0;
  const discountPct = getDiscountPercent(product);

  // Focus the dialog on open, restore focus to the trigger on close, close on Escape,
  // and keep Tab inside the dialog while it is open.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [onClose]);

  const handleAddToCart = () => {
    if (!selectedSize || selectedStock === 0) return;
    onAddToCart(product, selectedSize, 1);
  };

  return (
    <motion.div
      exit={{ pointerEvents: "none" }}
      className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:py-6"
      id="quick-view-root"
    >
      <motion.div
        className="overlay-backdrop"
        {...OVERLAY_MOTION.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-view-title"
        className="dialog-panel relative z-10 flex w-full max-w-md sm:max-w-3xl max-h-full overflow-hidden"
        {...OVERLAY_MOTION.dialog}
        id="quick-view-dialog"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close quick preview"
          className="btn-icon rounded-xs absolute right-2 top-2 sm:right-3 sm:top-3 z-20 bg-canvas/90 shadow-sm"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrolls inside the panel, so the close button above always stays in view */}
        <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain grid grid-cols-1 sm:grid-cols-2 sm:items-start">
          {/* The whole garment stays visible: the photo is contained, never cropped. Phones
              give it about half the screen height; wider screens pin it beside the details. */}
          <div className="h-[min(52svh,30rem)] sm:sticky sm:top-0 sm:h-[min(36rem,calc(100svh-3rem))] w-full bg-surface-muted">
            <ProductImage
              src={getProductImage(product)}
              alt={product.name}
              className="w-full h-full object-contain"
              loading="eager"
              sizes="(min-width: 640px) 320px, 100vw"
            />
          </div>

          <div className="p-4 min-[400px]:p-5 sm:p-7 flex flex-col gap-4 sm:min-h-[min(36rem,calc(100svh-3rem))]">
            <div className="space-y-1.5 pr-8">
              <span className="eyebrow">
                {collection.name}
                {product.subcategory ? ` · ${product.subcategory}` : ""}
              </span>
              <h2 id="quick-view-title" className="heading-card">
                {product.name}
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="price text-lg">
                  {formatINR(getEffectivePrice(product))}
                </span>
                {discountPct && (
                  <span className="price-was text-sm">{formatINR(product.price)}</span>
                )}
              </div>
            </div>

            {product.description && (
              <p className="text-body line-clamp-3">{product.description}</p>
            )}

            {/* Sizes and stock */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="field-label mb-0">Size</span>
                <span
                  className={`flex items-center gap-1 text-xs font-semibold ${isOutOfStock ? "text-danger" : "text-success"}`}
                  aria-live="polite"
                >
                  {isOutOfStock ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" /> Sold out
                    </>
                  ) : selectedSize ? (
                    `${selectedStock} left in ${selectedSize}`
                  ) : (
                    "In stock"
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-[400px]:gap-2">
                {sizes.map((size) => {
                  const count = product.sizeStock[size] || 0;
                  const sizeOut = count === 0;
                  return (
                    <button
                      key={size}
                      type="button"
                      disabled={sizeOut}
                      onClick={() => setSelectedSize(size)}
                      aria-pressed={selectedSize === size}
                      aria-label={`Size ${size}, ${sizeOut ? "sold out" : `${count} in stock`}`}
                      className="size-option min-w-12 min-h-11"
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto pt-2 space-y-2">
              {!isOutOfStock && (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!selectedSize}
                  className="btn btn-primary btn-block"
                >
                  {selectedSize ? "Add to Cart" : "Select a Size"}
                </button>
              )}
              <a
                href={getProductPath(product.id)}
                onClick={(e) => {
                  if (!isPlainLeftClick(e)) return;
                  e.preventDefault();
                  onViewFullDetails(product);
                }}
                className="btn btn-secondary btn-block"
              >
                View Full Details <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
