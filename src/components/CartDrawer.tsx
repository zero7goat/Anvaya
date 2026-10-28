import { FormEvent, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OVERLAY_MOTION } from "../utils/motion";
import { X, ShoppingBag, Trash2, ArrowRight, Tag, CheckCircle, AlertCircle } from "lucide-react";
import { CartItem, Offer } from "../types";
import { offerService } from "../services/offerService";
import ProductImage from "./ProductImage";
import { getProductImage } from "../data/imageRegistry";
import { BOUTIQUE_CONFIG } from "../config";
import { calculateCartTotals, getOfferIneligibility, getUnitPrice } from "../utils/pricing";
import { useOverlay } from "../hooks/useOverlay";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, size: string, quantity: number) => void;
  onRemoveItem: (productId: string, size: string) => void;
  onCheckout: (appliedPromoCode?: string) => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}: CartDrawerProps) {
  const [promoCode, setPromoCode] = useState<string>("");
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [promoError, setPromoError] = useState<string>("");
  const [promoSuccess, setPromoSuccess] = useState<string>("");
  const [checkingPromo, setCheckingPromo] = useState<boolean>(false);

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(isOpen, onClose, panelRef);

  // Same rules as checkout: subtotal, coupon (re-checked as the bag changes), shipping
  const { subtotal, discount: discountAmount, shipping: shippingCost, total: grandTotal, amountToFreeShipping } =
    calculateCartTotals(cartItems, activeOffer, BOUTIQUE_CONFIG);
  // An applied coupon the bag no longer qualifies for (e.g. after removing a piece)
  const couponNoLongerApplies = activeOffer ? getOfferIneligibility(activeOffer, subtotal) : null;

  // Validate Promo Code against in-memory offers
  const handleApplyPromo = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError("");
    setPromoSuccess("");

    try {
      const matched = offerService.findActiveOfferByCode(promoCode);

      if (!matched) {
        setPromoError("Invalid coupon or code expired.");
        setActiveOffer(null);
      } else if (getOfferIneligibility(matched, subtotal)) {
        setPromoError(getOfferIneligibility(matched, subtotal)!);
        setActiveOffer(null);
      } else {
        setActiveOffer(matched);
        setPromoSuccess(`Coupon "${matched.code}" applied successfully!`);
      }
    } catch (err) {
      setPromoError("Failed to apply promotion coupon.");
    } finally {
      setCheckingPromo(false);
    }
  };

  const handleCheckoutClick = () => {
    onCheckout(discountAmount > 0 ? activeOffer?.code : undefined);
  };

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div key="cart-drawer" {...OVERLAY_MOTION.backdrop} className="fixed inset-0 z-50 overflow-hidden" id="cart-drawer-root">
      {/* Backdrop */}
      <div
        className="overlay-backdrop absolute"
        onClick={onClose}
        id="cart-drawer-backdrop"
      ></div>

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10" id="cart-drawer-slider-container">
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-drawer-title"
            tabIndex={-1}
            {...OVERLAY_MOTION.drawerRight}
            className="w-[calc(100vw-2.5rem)] max-w-md bg-canvas flex flex-col h-full shadow-2xl outline-none"
            id="cart-drawer-card"
          >
            {/* Drawer Header */}
            <div className="px-4 py-4 sm:px-6 border-b border-line flex items-center justify-between bg-surface" id="cart-drawer-header">
              <div className="flex flex-wrap items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-accent" />
                <h2 id="cart-drawer-title" className="heading-card text-lg sm:text-lg">Your Wardrobe Bag</h2>
                <span className="badge badge-neutral tabular-nums" aria-label={`${cartItems.length} ${cartItems.length === 1 ? "item" : "items"}`}>
                  {cartItems.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="btn-icon" aria-label="Close cart"
                id="close-cart-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6" id="cart-items-scroll-pane">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4" id="cart-empty-state">
                  <ShoppingBag className="w-10 h-10 text-line-strong" />
                  <div>
                    <h3 className="heading-card text-lg sm:text-lg">Your shopping bag is empty</h3>
                    <p className="text-sm text-muted mt-1 max-w-xs leading-relaxed">
                      Explore our handcrafted kurtas and sarees to fill your bag.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="btn btn-primary"
                    id="empty-cart-explore-btn"
                  >
                    Browse Collection
                  </button>
                </div>
              ) : (
                cartItems.map((item) => {
                  const itemPrice = getUnitPrice(item.product);
                  const itemTotalPrice = itemPrice * item.quantity;
                  const availableSizeStock = item.product.sizeStock ? (item.product.sizeStock[item.selectedSize] || 0) : 0;
                  const reachedMax = item.quantity >= availableSizeStock;

                  return (
                    <div
                      key={`${item.product.id}-${item.selectedSize}`}
                      className="flex items-start justify-between border-b border-line pb-5"
                      id={`cart-item-${item.product.id}-${item.selectedSize}`}
                    >
                      {/* Clothing Thumbnail without borders or grey loading flash */}
                      <div className="w-16 aspect-[3/4] overflow-hidden bg-surface-muted shrink-0">
                        <ProductImage src={getProductImage(item.product)} alt={item.product.name} className="w-full h-full object-cover" compact />
                      </div>

                    {/* Clothing Meta details */}
                    <div className="ml-3 sm:ml-4 flex-1 min-w-0 flex flex-col justify-between gap-2 min-h-20">
                      <div>
                        <span className="eyebrow">
                          {item.product.category}
                        </span>
                        <h4 className="text-sm text-ink line-clamp-1 mt-0.5">
                          {item.product.name}
                        </h4>
                        <span className="badge badge-neutral mt-1.5">
                          Size: {item.selectedSize}
                        </span>
                      </div>

                      {/* Size-specific Quantity selectors */}
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.selectedSize, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          aria-label={`Decrease quantity of ${item.product.name}`}
                          className="shrink-0 w-8 h-8 sm:w-6 sm:h-6 border border-line-strong rounded-xs flex items-center justify-center text-xs text-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-bold"
                        >
                          -
                        </button>
                        <span className="text-xs font-semibold text-ink w-6 text-center select-none tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.selectedSize, item.quantity + 1)}
                          disabled={reachedMax}
                          aria-label={`Increase quantity of ${item.product.name}`}
                          className="shrink-0 w-8 h-8 sm:w-6 sm:h-6 border border-line-strong rounded-xs flex items-center justify-center text-xs text-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-bold"
                        >
                          +
                        </button>
                        {reachedMax && (
                          <span className="badge badge-danger">
                            Max Stock ({availableSizeStock})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pricing in Rupees & trash */}
                    <div className="ml-2 sm:ml-4 flex flex-col items-end justify-between min-h-20 shrink-0">
                      <span className="price text-sm">
                        ₹{itemTotalPrice.toLocaleString("en-IN")}
                      </span>
                      <button
                        onClick={() => onRemoveItem(item.product.id, item.selectedSize)}
                        className="btn-icon btn-icon-sm hover:!text-danger hover:!bg-danger-soft"
                        title="Remove outfit"
                        aria-label={`Remove ${item.product.name} (size ${item.selectedSize})`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Checkout & Coupon Promo Footer */}
          {cartItems.length > 0 && (
            <div className="border-t border-line p-4 sm:p-6 bg-surface space-y-4" id="cart-drawer-footer">

              {/* Coupon Entry Field */}
              <div className="panel-muted p-3 space-y-2" id="coupon-field-container">
                <label htmlFor="cart-coupon-input" className="flex items-center space-x-1.5 field-label mb-0">
                  <Tag className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  <span>Promo Coupon Code</span>
                </label>

                <form onSubmit={handleApplyPromo} className="flex gap-2">
                  <input
                    id="cart-coupon-input"
                    type="text"
                    placeholder="e.g. ALANKRITHA10"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    className="field field-sm flex-1 min-w-0 uppercase"
                  />
                  <button
                    type="submit"
                    disabled={checkingPromo || !promoCode.trim()}
                    className="btn btn-primary btn-sm shrink-0"
                  >
                    {checkingPromo ? "Validating..." : "Apply"}
                  </button>
                </form>

                {promoError && (
                  <p className="field-error mt-1" role="alert">
                    <AlertCircle className="w-3 h-3" />
                    <span>{promoError}</span>
                  </p>
                )}

                {promoSuccess && !couponNoLongerApplies && (
                  <p className="field-error mt-1 !text-success" role="status">
                    <CheckCircle className="w-3 h-3" />
                    <span>{promoSuccess}</span>
                  </p>
                )}
                {couponNoLongerApplies && (
                  <p className="field-error mt-1" role="status">
                    <AlertCircle className="w-3 h-3" />
                    <span>{activeOffer!.code} no longer applies: {couponNoLongerApplies}</span>
                  </p>
                )}
              </div>

              {/* Total Summary Breakdowns */}
              <div className="space-y-2 text-xs text-ink-soft" id="pricing-details">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-ink tabular-nums">₹{subtotal.toLocaleString("en-IN")}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-success font-semibold">
                    <span>Promo Coupon Discount</span>
                    <span className="tabular-nums">-₹{discountAmount.toLocaleString("en-IN")}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Shipping & Handling</span>
                  {shippingCost === 0 ? (
                    <span className="badge badge-success">
                      Free Shipping
                    </span>
                  ) : (
                    <span className="font-semibold text-ink tabular-nums">₹{shippingCost}</span>
                  )}
                </div>

                {shippingCost > 0 && (
                  <div className="text-xs text-accent font-medium pt-0.5 text-right">
                    Add ₹{amountToFreeShipping.toLocaleString("en-IN")} more for FREE home delivery.
                  </div>
                )}

                <div className="flex justify-between items-baseline border-t border-line pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink" id="total-price-row">
                  <span>Total Payable</span>
                  <span className="price text-base tracking-normal">₹{grandTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Secure checkout dispatch button */}
              <button
                onClick={handleCheckoutClick}
                className="btn btn-primary btn-lg btn-block"
                id="cart-checkout-btn"
              >
                <span>Checkout Wardrobe</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center space-x-1.5 text-xs text-muted">
                <span>Cash on Delivery available · Delivering across India</span>
              </div>
            </div>
          )}

        </motion.div>
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
