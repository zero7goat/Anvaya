import { MouseEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShoppingBag, X } from "lucide-react";
import { Product } from "../types";
import { getSizeOptions } from "../utils/productDisplay";
import { MOTION_TRANSITION } from "../utils/motion";
import { useCartActions } from "../context/CartActionsContext";

/**
 * Quick add for product cards: a bag button (shown under the quick-view eye) that
 * opens a size picker sliding up over the bottom of the photo. Choosing an in-stock
 * size adds one piece to the cart. Renders nothing if no cart provider exists or the
 * product is sold out.
 *
 * `button` and `picker` are placed separately by the card: the button in the action
 * column, the picker in an overlay the size of the image.
 */
// `solid`: a filled square bag button (phone search cards) instead of the round photo-corner one
export function useQuickAdd(product: Product, { solid = false }: { solid?: boolean } = {}) {
  const cart = useCartActions();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sizes = getSizeOptions(product);
  const canAdd = !!cart && sizes.some((s) => (product.sizeStock[s] || 0) > 0);

  const button = canAdd ? (
    <button
      ref={toggleRef}
      type="button"
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (sizes.length === 1) cart!.addToCart(product, sizes[0], 1);
        else setOpen(!open);
      }}
      aria-label={`Add ${product.name} to cart`}
      aria-expanded={open}
      title="Add to cart"
      className={
        solid
          ? `inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-xs text-white cursor-pointer transition-colors duration-300 ${open ? "bg-maroon-900" : "bg-maroon-700 hover:bg-maroon-800"}`
          : `z-10 inline-flex items-center justify-center w-8 h-8 rounded-full shadow-sm backdrop-blur-sm cursor-pointer transition-[background-color,color,box-shadow,opacity,transform] duration-300 hover:shadow-md ${
              open ? "bg-maroon-700 text-white" : "bg-white/85 text-ink hover:bg-white hover:text-black"
            }`
      }
    >
      <ShoppingBag className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  ) : null;

  const picker = canAdd ? (
    <SizePicker
      open={open}
      product={product}
      sizes={sizes}
      toggleRef={toggleRef}
      onClose={() => setOpen(false)}
      onPick={(size) => {
        cart!.addToCart(product, size, 1);
        setOpen(false);
      }}
    />
  ) : null;

  return { button, picker };
}

function SizePicker({
  open,
  product,
  sizes,
  toggleRef,
  onClose,
  onPick,
}: {
  open: boolean;
  product: Product;
  sizes: string[];
  toggleRef: { current: HTMLButtonElement | null };
  onClose: () => void;
  onPick: (size: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the picker
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // A click elsewhere closes it; the bag button toggles it itself
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (toggleRef.current?.contains(target)) return;
      if (panelRef.current && !panelRef.current.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="group"
          aria-label={`Choose a size for ${product.name}`}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: MOTION_TRANSITION.fast }}
          exit={{ y: "100%", opacity: 0, transition: { duration: 0.25 } }}
          className="@container absolute inset-x-0 bottom-0 z-20 bg-white/95 backdrop-blur-sm px-3 pt-2.5 pb-3 pointer-events-auto"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink">Select size</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close size picker"
              className="p-0.5 text-muted hover:text-ink cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Sarees: one row of four. Kurtas: one row of five, or 3 + 2 on narrow cards
              so each size stays easy to tap */}
          <div className={`grid gap-1 ${sizes.length > 4 ? "grid-cols-3 @[13rem]:grid-cols-5" : "grid-cols-4"}`}>
            {sizes.map((size) => {
              const out = (product.sizeStock[size] || 0) === 0;
              return (
                <button
                  key={size}
                  type="button"
                  disabled={out}
                  onClick={() => onPick(size)}
                  aria-label={out ? `Size ${size}, sold out` : `Add size ${size} to cart`}
                  className="h-8 min-w-0 px-0 border border-line-strong text-[11px] sm:text-xs font-semibold text-ink transition-colors cursor-pointer hover:bg-maroon-700 hover:border-maroon-700 hover:text-white disabled:cursor-not-allowed disabled:text-muted/50 disabled:line-through disabled:hover:bg-transparent disabled:hover:border-line-strong disabled:hover:text-muted/50"
                >
                  {size}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
