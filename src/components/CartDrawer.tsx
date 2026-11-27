import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OVERLAY_MOTION } from "../utils/motion";
import { X, ShoppingBag, Trash2, MessageSquare, Tag, CheckCircle, AlertCircle, Lock } from "lucide-react";
import { CartItem, Offer } from "../types";
import { offerService } from "../services/offerService";
import { orderService } from "../services/orderService";
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
  // The applied coupon code, kept by the app across reloads; only the code is kept
  couponCode?: string;
  onCouponChange: (code: string | undefined) => void;
  // Opens online payment checkout; without it, the bag orders on WhatsApp only
  onCheckout?: () => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  couponCode,
  onCouponChange,
  onCheckout,
}: CartDrawerProps) {
  const [promoCode, setPromoCode] = useState<string>(couponCode ?? "");
  const [promoError, setPromoError] = useState<string>("");
  const [checkingPromo, setCheckingPromo] = useState<boolean>(false);

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(isOpen, onClose, panelRef);

  // The coupon box shows only while a coupon is switched on in the admin dashboard. Each time
  // the bag opens, the saved code is looked up again, so an expired or ineligible coupon
  // never gives a discount. The boutique confirms the final amount on WhatsApp.
  const [couponsAvailable, setCouponsAvailable] = useState(false);
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [couponLookedUp, setCouponLookedUp] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    let current = true;
    offerService.lookup(couponCode).then(({ available, offer }) => {
      if (!current) return;
      setCouponsAvailable(available);
      setActiveOffer(offer);
      setCouponLookedUp(true);
      if (!available && couponCode) onCouponChange(undefined); // nothing to apply any more
    });
    return () => {
      current = false;
    };
  }, [isOpen, couponCode]);
  useEffect(() => {
    if (!couponCode) setActiveOffer(null); // removed, or cleared after an order
  }, [couponCode]);
  const couponUnavailable = couponLookedUp && Boolean(couponCode) && !activeOffer;

  // Subtotal and coupon, re-checked as the bag changes; shipping is always free
  const { subtotal, discount: discountAmount, total: grandTotal } = calculateCartTotals(cartItems, activeOffer);
  // An applied coupon the bag no longer qualifies for (e.g. after removing a piece)
  const couponNoLongerApplies = activeOffer ? getOfferIneligibility(activeOffer, subtotal) : null;

  // Validate Promo Code against in-memory offers
  const handleApplyPromo = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError("");

    try {
      const { offer: matched } = await offerService.lookup(promoCode);

      if (!matched) {
        setPromoError("Invalid coupon or code expired.");
        onCouponChange(undefined);
      } else if (getOfferIneligibility(matched, subtotal)) {
        setPromoError(getOfferIneligibility(matched, subtotal)!);
        onCouponChange(undefined);
      } else {
        setActiveOffer(matched);
        onCouponChange(matched.code);
      }
    } catch (err) {
      setPromoError("Failed to apply promotion coupon.");
    } finally {
      setCheckingPromo(false);
    }
  };

  const handleRemoveCoupon = () => {
    onCouponChange(undefined);
    setPromoCode("");
    setPromoError("");
  };

  // Orders are placed by WhatsApp enquiry, with the bag as the bag shows it
  const enquiryUrl = orderService.generateWhatsAppEnquiryUrl({
    items: cartItems,
    subtotal,
    discount: discountAmount,
    couponCode: activeOffer?.code,
    total: grandTotal,
  });

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
              {couponsAvailable && (
              <div className="panel-muted p-3 space-y-2" id="coupon-field-container">
                <label htmlFor="cart-coupon-input" className="flex items-center space-x-1.5 field-label mb-0">
                  <Tag className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  <span>Promo Coupon Code</span>
                </label>

                <form onSubmit={handleApplyPromo} className="flex gap-2">
                  <input
                    id="cart-coupon-input"
                    type="text"
                    placeholder="Enter code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    className="field field-sm field-touch flex-1 min-w-0 uppercase"
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

                {activeOffer && !couponNoLongerApplies && (
                  <p className="field-error mt-1 !text-success" role="status">
                    <CheckCircle className="w-3 h-3" />
                    <span>Coupon "{activeOffer.code}" applied.</span>
                  </p>
                )}
                {couponNoLongerApplies && (
                  <p className="field-error mt-1" role="status">
                    <AlertCircle className="w-3 h-3" />
                    <span>{activeOffer!.code} no longer applies: {couponNoLongerApplies}</span>
                  </p>
                )}
                {couponUnavailable && (
                  <p className="field-error mt-1" role="status">
                    <AlertCircle className="w-3 h-3" />
                    <span>Coupon "{couponCode}" is no longer available.</span>
                  </p>
                )}
                {couponCode && (
                  <button type="button" onClick={handleRemoveCoupon} className="link text-xs">
                    Remove coupon
                  </button>
                )}
              </div>
              )}

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
                  <span className="badge badge-success">
                    Free Shipping
                  </span>
                </div>

                <div className="flex justify-between items-baseline border-t border-line pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink" id="total-price-row">
                  <span>Total Payable</span>
                  <span className="price text-base tracking-normal">₹{grandTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {onCheckout ? (
                <>
                  {/* Pay online: the main way to order once online payment is on */}
                  <button type="button" onClick={onCheckout} className="btn btn-primary btn-lg btn-block" id="cart-checkout-btn">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    <span>Checkout &amp; pay online</span>
                  </button>
                  <p className="text-xs text-muted text-center">UPI, cards or net banking. Delivering across India.</p>
                  <a href={enquiryUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block" id="cart-whatsapp-enquiry-btn">
                    <MessageSquare className="w-4 h-4" aria-hidden="true" />
                    <span>Ask on WhatsApp first</span>
                  </a>
                </>
              ) : (
                <>
                  {/* Orders are placed in the WhatsApp chat */}
                  <a
                    href={enquiryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-whatsapp btn-lg btn-block"
                    id="cart-whatsapp-enquiry-btn"
                  >
                    <MessageSquare className="w-4 h-4 fill-white" aria-hidden="true" />
                    <span>Order on WhatsApp</span>
                  </a>

                  <p className="text-xs text-muted text-center">
                    Sends your bag to the boutique on WhatsApp. They will confirm availability, the final amount and payment. Delivering across India.
                  </p>
                </>
              )}
            </div>
          )}

        </motion.div>
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
