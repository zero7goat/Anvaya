import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowRight, MessageSquare, ShoppingBag, Truck, X } from "lucide-react";
import { Product } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";
import { OVERLAY_MOTION } from "../utils/motion";
import ProductImage from "./ProductImage";
import SizePrompt, { focusFirstSize } from "./SizePrompt";
import { getProductImages } from "../data/imageRegistry";
import { orderService } from "../services/orderService";
import { parseProductDetails } from "../utils/productDetails";
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
  const { intro, details } = useMemo(() => parseProductDetails(product.description), [product.description]);
  const sizes = getSizeOptions(product);
  // One-size pieces (sarees) start with Free Size chosen when it is in stock
  const [selectedSize, setSelectedSize] = useState(() =>
    sizes.length === 1 && (product.sizeStock[sizes[0]] || 0) > 0 ? sizes[0] : ""
  );
  const isOutOfStock = productService.getTotalStock(product) === 0;
  const selectedStock = selectedSize ? product.sizeStock[selectedSize] || 0 : 0;
  const discountPct = getDiscountPercent(product);
  const images = getProductImages(product);
  const [activeImage, setActiveImage] = useState(0);
  const totalStock = productService.getTotalStock(product);
  const whatsappLink = orderService.generateWhatsAppProductEnquiryUrl(product.name, selectedSize || undefined);

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

  // Add to Cart pressed before choosing a size: same as the product page, the message goes
  // under the sizes, which scroll into view inside the dialog and take focus
  const [sizePrompt, setSizePrompt] = useState(false);
  const sizeGroupRef = useRef<HTMLDivElement>(null);
  const askForSize = () => {
    setSizePrompt(true);
    sizeGroupRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    focusFirstSize(sizeGroupRef.current);
  };

  const handleSizeChange = (size: string) => {
    setSelectedSize(size);
    setSizePrompt(false);
  };

  const handleAddToCart = () => {
    if (!selectedSize) return askForSize();
    if (selectedStock === 0) return;
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
        className="dialog-panel relative z-10 flex w-full max-w-md sm:max-w-4xl max-h-full overflow-hidden shadow-2xl"
        {...OVERLAY_MOTION.dialog}
        id="quick-view-dialog"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close quick preview"
          className="btn-icon !rounded-full absolute right-2.5 top-2.5 sm:right-3 sm:top-3 z-20 bg-surface shadow-md hover:!bg-surface-muted"
        >
          <X className="w-4 h-4" strokeWidth={1.8} />
        </button>

        {/* Scrolls inside the panel, so the close button above always stays in view */}
        <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain grid grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:items-start">
          {/* Product photos are 3:4, so a 3:4 frame shows the whole garment with no cropping
              or empty bands. Phones give it about half the screen height; wider screens pin it
              beside the details. */}
          <div className="sm:sticky sm:top-0 w-full bg-surface-muted">
            <div className="relative mx-auto h-[min(52svh,30rem)] aspect-[3/4] sm:h-auto sm:w-full overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.div
                  key={activeImage}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0"
                >
                  <ProductImage
                    src={images[activeImage] ?? ""}
                    alt={images.length > 1 ? `${product.name}, photo ${activeImage + 1} of ${images.length}` : product.name}
                    className="w-full h-full object-cover"
                    loading="eager"
                    sizes="(min-width: 640px) 420px, 100vw"
                  />
                </motion.div>
              </AnimatePresence>
              {discountPct && !isOutOfStock && (
                <span className="absolute top-3 left-3 badge badge-sale">{discountPct}% OFF</span>
              )}
              {images.length > 1 && (
                <span className="absolute bottom-3 right-3 rounded-full bg-ink/60 text-white text-2xs px-2 py-0.5 tabular-nums">
                  {activeImage + 1} / {images.length}
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto" role="group" aria-label="Photos">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-pressed={activeImage === i}
                    className={`w-12 aspect-[3/4] shrink-0 overflow-hidden rounded-xs border-2 transition-colors cursor-pointer ${
                      activeImage === i ? "border-maroon-700" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <ProductImage src={src} alt="" className="w-full h-full object-cover" compact />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 min-[400px]:p-5 sm:p-7 flex flex-col gap-4 sm:min-h-[min(36rem,calc(100svh-3rem))]">
            <div className="space-y-2 pr-9">
              <span className="eyebrow">
                {collection.name}
                {product.subcategory ? ` · ${product.subcategory}` : ""}
              </span>
              <h2 id="quick-view-title" className="font-serif text-2xl sm:text-[1.75rem] leading-tight text-ink">
                {product.name}
              </h2>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pt-0.5">
                <span className="text-xl font-semibold text-ink tabular-nums">
                  {formatINR(getEffectivePrice(product))}
                </span>
                {discountPct && (
                  <>
                    <span className="price-was text-sm">{formatINR(product.price)}</span>
                    <span className="text-xs font-semibold text-success">
                      You save {formatINR(product.price - getEffectivePrice(product))}
                    </span>
                  </>
                )}
              </div>
              {!isOutOfStock && totalStock <= 2 && (
                <p className="text-xs font-semibold text-maroon-600">Only {totalStock} left</p>
              )}
            </div>

            {/* The description as the product page shows it: its paragraph, then the first
                few "Label: value" details (the rest are on the product page) */}
            {intro && <p className="text-body line-clamp-3 border-t border-line pt-4">{intro}</p>}
            {details.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm panel-muted p-4">
                {details.slice(0, 4).map((d, i) => (
                  <div key={`${d.label}-${i}`} className="min-w-0">
                    <dt className="font-semibold text-ink">{d.label}</dt>
                    <dd className="text-ink/85 line-clamp-2">{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Sizes and stock */}
            <div
              ref={sizeGroupRef}
              role="group"
              aria-labelledby="quick-view-size-label"
              aria-describedby={sizePrompt && !selectedSize ? "quick-view-size-prompt" : undefined}
              className="space-y-2 scroll-my-3"
            >
              <div className="flex items-center justify-between">
                <span id="quick-view-size-label" className={`field-label mb-0 ${sizePrompt && !selectedSize ? "!text-danger" : ""}`}>
                  Size
                </span>
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
                      onClick={() => handleSizeChange(size)}
                      aria-pressed={selectedSize === size}
                      aria-label={`Size ${size}, ${sizeOut ? "sold out" : `${count} in stock`}`}
                      className="size-option min-w-14 min-h-12"
                    >
                      <span>{size}</span>
                      <span className="text-2xs font-normal opacity-80">{sizeOut ? "sold out" : `${count} left`}</span>
                    </button>
                  );
                })}
              </div>
              {sizePrompt && !selectedSize && <SizePrompt id="quick-view-size-prompt" />}
            </div>

            <div className="mt-auto pt-2 space-y-2.5">
              {!isOutOfStock && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="btn btn-primary btn-lg"
                  >
                    <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                    {selectedSize ? "Add to Cart" : "Select a Size"}
                  </button>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-whatsapp btn-lg px-4"
                    aria-label="Ask about this piece on WhatsApp"
                    title="Ask on WhatsApp"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>
                </div>
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
                View full details <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <p className="flex items-center justify-center gap-1.5 text-2xs text-muted pt-1">
                <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                Free shipping across India · dispatched in 3 to 5 working days
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
