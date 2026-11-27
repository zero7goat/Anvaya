import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OVERLAY_MOTION } from "../utils/motion";
import { X, ShoppingBag, Trash2, MessageSquare, Tag, CheckCircle, AlertCircle, Lock, Minus, Plus, Truck, ShieldCheck, Sparkles, ChevronDown } from "lucide-react";
import { CartItem, Offer, Product } from "../types";
import { productService } from "../services/productService";
import { formatINR, getDiscountPercent, getEffectivePrice, getCollectionKey } from "../utils/productDisplay";
import { MOTION_TRANSITION } from "../utils/motion";
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
  // The line just added ("productId|size"), highlighted for a moment
  justAdded?: { key: string; at: number } | null;
  // Opens a suggested piece from the empty bag
  onOpenProduct?: (product: Product) => void;
}

// How long a just-added line stays highlighted
const JUST_ADDED_MS = 3500;

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  couponCode,
  onCouponChange,
  onCheckout,
  justAdded,
  onOpenProduct,
}: CartDrawerProps) {
  // The highlight fades after a moment (re-armed by each add)
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  useEffect(() => {
    if (!justAdded || Date.now() - justAdded.at > JUST_ADDED_MS) return;
    setHighlightKey(justAdded.key);
    const timer = setTimeout(() => setHighlightKey(null), JUST_ADDED_MS);
    return () => clearTimeout(timer);
  }, [justAdded]);
  const [promoCode, setPromoCode] = useState<string>(couponCode ?? "");
  const [promoError, setPromoError] = useState<string>("");
  const [checkingPromo, setCheckingPromo] = useState<boolean>(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const pieceCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const openProduct = (product: Product) => {
    if (!onOpenProduct) return;
    onClose();
    onOpenProduct(product);
  };

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

  // A WhatsApp enquiry with the bag as the bag shows it (the only way to order while online payment is off)
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

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10" id="cart-drawer-slider-container">
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-drawer-title"
            tabIndex={-1}
            {...OVERLAY_MOTION.drawerRight}
            className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2.5rem)] max-w-[27rem] bg-canvas flex flex-col h-full shadow-2xl outline-none"
            id="cart-drawer-card"
          >
            {/* Header: brand band with the bag's size */}
            <div className="bg-maroon-950 text-white px-5 sm:px-6 pt-5 pb-4 flex items-start justify-between gap-4" id="cart-drawer-header">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-[0.24em] text-gold-300">{BOUTIQUE_CONFIG.brandName}</p>
                <h2 id="cart-drawer-title" className="font-serif text-2xl mt-1 !text-white">Your Bag</h2>
                <p className="text-xs text-white/65 mt-0.5 tabular-nums" aria-live="polite">
                  {pieceCount === 0 ? "Nothing added yet" : `${pieceCount} ${pieceCount === 1 ? "piece" : "pieces"}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="btn-icon -mr-2 !text-white/80 hover:!text-white hover:!bg-white/10"
                aria-label="Close cart"
                id="close-cart-btn"
              >
                <X className="w-5 h-5" strokeWidth={1.6} />
              </button>
            </div>
            <p className="flex items-center justify-center gap-2 bg-gold-300/60 text-maroon-950 text-xs font-medium py-2 px-4">
              <Truck className="w-3.5 h-3.5" aria-hidden="true" />
              Free shipping across India on every order
            </p>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 space-y-3" id="cart-items-scroll-pane">
              {cartItems.length === 0 ? (
                <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 py-6" id="cart-empty-state">
                  <span className="w-20 h-20 rounded-full bg-surface border border-gold-300 flex items-center justify-center shadow-sm">
                    <ShoppingBag className="w-8 h-8 text-maroon-700" strokeWidth={1.4} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-serif text-xl text-ink">Your bag is empty</h3>
                    <p className="text-sm text-muted mt-1.5 max-w-xs leading-relaxed">
                      Explore handcrafted kurtas from Alankritha and sarees from Ayanaa.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="btn btn-primary"
                    id="empty-cart-explore-btn"
                  >
                    Continue shopping
                  </button>
                  {onOpenProduct && <BagSuggestions onOpen={(product) => { onClose(); onOpenProduct(product); }} />}
                </div>
              ) : (
                <>
                <AnimatePresence initial={false}>
                  {highlightKey && (
                    <motion.div
                      key="just-added"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITION.base }}
                      exit={{ opacity: 0, transition: MOTION_TRANSITION.fast }}
                      className="status-note status-note-success -mt-1"
                      role="status"
                    >
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>Added to your bag</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false}>
                {cartItems.map((item) => {
                  const itemPrice = getUnitPrice(item.product);
                  const itemTotalPrice = itemPrice * item.quantity;
                  const availableSizeStock = item.product.sizeStock ? (item.product.sizeStock[item.selectedSize] || 0) : 0;
                  const reachedMax = item.quantity >= availableSizeStock;

                  const isNew = highlightKey === `${item.product.id}|${item.selectedSize}`;
                  const discountPct = getDiscountPercent(item.product);
                  const collectionName = BOUTIQUE_CONFIG.collections[getCollectionKey(item.product)].name;
                  const stepperButton =
                    "w-8 h-8 flex items-center justify-center text-ink-soft hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer";
                  return (
                    <motion.div
                      key={`${item.product.id}-${item.selectedSize}`}
                      layout
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITION.base }}
                      exit={{ opacity: 0, x: 24, transition: MOTION_TRANSITION.fast }}
                      className={`flex gap-3.5 sm:gap-4 p-3 rounded-sm border bg-surface transition-[background-color,border-color] duration-700 ${
                        isNew ? "border-gold-500 bg-gold-300/20" : "border-line"
                      }`}
                      id={`cart-item-${item.product.id}-${item.selectedSize}`}
                    >
                      {/* Photo (opens the piece) */}
                      <button
                        type="button"
                        onClick={() => openProduct(item.product)}
                        className="w-20 sm:w-[5.5rem] aspect-[3/4] overflow-hidden rounded-xs bg-surface-muted shrink-0 cursor-pointer"
                        aria-label={`View ${item.product.name}`}
                        tabIndex={onOpenProduct ? 0 : -1}
                      >
                        <ProductImage src={getProductImage(item.product)} alt="" className="w-full h-full object-cover" sizes="96px" />
                      </button>

                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted">{collectionName}</p>
                            <button
                              type="button"
                              onClick={() => openProduct(item.product)}
                              className="mt-0.5 font-serif text-[0.95rem] leading-snug text-ink line-clamp-2 text-left hover:text-maroon-700 transition-colors cursor-pointer"
                            >
                              {item.product.name}
                            </button>
                          </div>
                          <button
                            onClick={() => onRemoveItem(item.product.id, item.selectedSize)}
                            className="btn-icon btn-icon-sm -mr-1.5 -mt-1 shrink-0 hover:!text-danger hover:!bg-danger-soft"
                            title="Remove"
                            aria-label={`Remove ${item.product.name} (size ${item.selectedSize})`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="mt-1 text-xs text-ink-soft">
                          Size <span className="font-semibold text-ink">{item.selectedSize}</span>
                          <span className="text-line-strong mx-1.5" aria-hidden="true">|</span>
                          <span className="tabular-nums">{formatINR(itemPrice)}</span>
                          {discountPct && <span className="price-was ml-1.5 tabular-nums">{formatINR(item.product.price)}</span>}
                        </p>

                        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                          {/* Quantity */}
                          <div>
                            <div className="inline-flex items-center rounded-full border border-line-strong bg-canvas" role="group" aria-label={`Quantity of ${item.product.name}`}>
                              <button
                                onClick={() => onUpdateQuantity(item.product.id, item.selectedSize, item.quantity - 1)}
                                disabled={item.quantity <= 1}
                                aria-label={`Decrease quantity of ${item.product.name}`}
                                className={stepperButton}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-semibold text-ink tabular-nums select-none" aria-live="polite">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => onUpdateQuantity(item.product.id, item.selectedSize, item.quantity + 1)}
                                disabled={reachedMax}
                                aria-label={`Increase quantity of ${item.product.name}`}
                                className={stepperButton}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {reachedMax && (
                              <p className="text-2xs text-maroon-600 mt-1">
                                {availableSizeStock === 1 ? "Only 1 available" : `All ${availableSizeStock} available are in your bag`}
                              </p>
                            )}
                          </div>
                          <span className="font-semibold text-ink tabular-nums">{formatINR(itemTotalPrice)}</span>
                        </div>
                      </div>
                  </motion.div>
                );
              })}
                </AnimatePresence>
                </>
            )}
          </div>

          {/* Checkout & Coupon Promo Footer */}
          {cartItems.length > 0 && (
            <div className="border-t border-line px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-5 bg-surface space-y-4 shadow-[0_-8px_24px_rgba(0,0,0,0.05)]" id="cart-drawer-footer">

              {/* Coupon Entry Field */}
              {couponsAvailable && (
              <div className="border border-line rounded-sm" id="coupon-field-container">
                <button
                  type="button"
                  onClick={() => setCouponOpen((open) => !open)}
                  aria-expanded={couponOpen || Boolean(couponCode)}
                  aria-controls="cart-coupon-body"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-ink cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-maroon-600" aria-hidden="true" />
                    {activeOffer && !couponNoLongerApplies ? `Coupon ${activeOffer.code} applied` : "Have a coupon code?"}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted transition-transform ${couponOpen || couponCode ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {(couponOpen || Boolean(couponCode)) && (
                <div id="cart-coupon-body" className="px-3 pb-3 space-y-2">
                <label htmlFor="cart-coupon-input" className="sr-only">Coupon code</label>
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
              </div>
              )}

              {/* Total Summary Breakdowns */}
              <div className="space-y-2 text-sm text-ink-soft" id="pricing-details">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-ink tabular-nums">₹{subtotal.toLocaleString("en-IN")}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-success font-semibold">
                    <span>Promo Coupon Discount</span>
                    <span className="tabular-nums">-₹{discountAmount.toLocaleString("en-IN")}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold text-success">Free</span>
                </div>

                <div className="flex justify-between items-baseline border-t border-line pt-3 text-ink" id="total-price-row">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em]">Total</span>
                  <span className="font-serif text-2xl tabular-nums">₹{grandTotal.toLocaleString("en-IN")}</span>
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

                  <p className="text-xs text-muted text-center leading-relaxed">
                    Sends your bag to the boutique on WhatsApp. They confirm availability, the final amount and payment.
                  </p>
                </>
              )}

              {/* Reassurance, from the shop's stated terms */}
              <ul className="grid grid-cols-3 gap-2 pt-3 border-t border-line text-center text-2xs text-ink-soft">
                <li className="flex flex-col items-center gap-1">
                  <Sparkles className="w-4 h-4 text-maroon-600" strokeWidth={1.6} aria-hidden="true" />
                  Handcrafted pieces
                </li>
                <li className="flex flex-col items-center gap-1">
                  <Truck className="w-4 h-4 text-maroon-600" strokeWidth={1.6} aria-hidden="true" />
                  Free delivery across India
                </li>
                <li className="flex flex-col items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-maroon-600" strokeWidth={1.6} aria-hidden="true" />
                  {BOUTIQUE_CONFIG.onlinePayment.enabled ? "Secure payment" : "Confirmed on WhatsApp"}
                </li>
              </ul>
            </div>
          )}

        </motion.div>
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Empty bag: the newest pieces in stock, so there is somewhere to start */
function BagSuggestions({ onOpen }: { onOpen: (product: Product) => void }) {
  const picks = productService
    .getProducts({ sortBy: "newest" })
    .filter((p) => productService.getTotalStock(p) > 0)
    .slice(0, 3);
  if (picks.length === 0) return null;
  return (
    <div className="w-full pt-6 mt-4 border-t border-line text-left">
      <p className="eyebrow text-ink mb-3">You may like</p>
      <ul className="grid grid-cols-3 gap-3">
        {picks.map((product) => (
          <li key={product.id}>
            <button type="button" onClick={() => onOpen(product)} className="group w-full text-left cursor-pointer">
              <div className="aspect-[3/4] overflow-hidden bg-surface-muted">
                <ProductImage src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" sizes="120px" />
              </div>
              <p className="mt-1.5 text-2xs text-ink line-clamp-2 group-hover:text-maroon-600 transition-colors">{product.name}</p>
              <p className="price text-2xs">{formatINR(getEffectivePrice(product))}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
