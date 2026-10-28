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
  const [selectedSize, setSelectedSize] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const collection = BOUTIQUE_CONFIG.collections[getCollectionKey(product)];
  const sizes = getSizeOptions(product);
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
    <motion.div exit={{ pointerEvents: "none" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" id="quick-view-root">
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
        className="dialog-panel relative z-10 w-full max-w-3xl max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain"
        {...OVERLAY_MOTION.dialog}
        id="quick-view-dialog"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close quick preview"
          className="btn-icon rounded-xs absolute right-3 top-3 z-10 bg-canvas/90"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="aspect-[3/4] max-h-[42vh] w-full sm:aspect-auto sm:max-h-none sm:min-h-full overflow-hidden bg-surface-muted">
            <ProductImage
              src={getProductImage(product)}
              alt={product.name}
              className="w-full h-full min-h-56 object-cover"
              loading="eager"
              sizes="(min-width: 640px) 320px, 100vw"
            />
          </div>

          <div className="p-6 sm:p-7 flex flex-col gap-4">
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
              <div className="flex flex-wrap gap-2">
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
                      className="size-option min-w-12"
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
