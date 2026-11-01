import { useEffect, useRef, useState, FormEvent, useMemo } from "react";
import {
  X, CheckCircle2, AlertCircle, ShoppingBag, Truck,
  MessageSquare, ShieldCheck, Loader2
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CartItem, Order } from "../types";
import { OVERLAY_MOTION } from "../utils/motion";
import { BOUTIQUE_CONFIG } from "../config";
import { orderService } from "../services/orderService";
import {
  orderApi, describeProblem, newIdempotencyKey, placeOrderThen, toRpcItems,
  type PlaceOrderResult, type Quote
} from "../services/orderApi";
import ProductImage from "./ProductImage";
import { getProductImage } from "../data/imageRegistry";
import { useOverlay } from "../hooks/useOverlay";
import { isValidEmail, isValidPincode, normalizeIndianMobile } from "../utils/validation";

type CheckoutField = "name" | "phone" | "email" | "address" | "city" | "state" | "pincode";

// What the database says this bag costs right now (quote_order). Orders are placed only
// against a "ready" quote, and the database checks that total again when placing.
type QuoteState =
  | { status: "loading" }
  | { status: "ready"; quote: Quote }
  | { status: "unavailable"; quote: Quote }
  | { status: "error"; message: string };

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  // Coupon chosen in the bag; the database decides whether it applies
  appliedPromoCode?: string;
  // Called only after the database has saved the order
  onOrderSuccess: (order: Order) => void;
  onOpenInbox: () => void;
  // Called when stock changed underneath the shopper, so the storefront can refresh
  onCatalogueChanged?: () => void;
}

const formatINR = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

export default function CheckoutModal({
  isOpen,
  onClose,
  cartItems,
  appliedPromoCode,
  onOrderSuccess,
  onOpenInbox,
  onCatalogueChanged,
}: CheckoutModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(isOpen, onClose, panelRef);
  // Guards against a second submission while the first is still being placed
  const submittingRef = useRef(false);
  // One key per checkout attempt, reused when that attempt is retried, so the database
  // returns the original order instead of placing a second one. Replaced after success.
  const checkoutKeyRef = useRef<string | null>(null);
  // Recipient Shipping fields
  const [customerName, setCustomerName] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [state, setState] = useState<string>("Karnataka");
  const [pincode, setPincode] = useState<string>("");

  // Operational states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  // When ordering online failed, offer a WhatsApp message that is clearly not an order
  const [offerHelp, setOfferHelp] = useState(false);
  // Field that failed validation: highlighted, described by the message, and focused
  const [invalidField, setInvalidField] = useState<CheckoutField | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "loading" });
  const quoteRequest = useRef(0);

  // A fresh checkout every time it opens (not the previous order's confirmation)
  useEffect(() => {
    if (!isOpen) return;
    setSuccessOrder(null);
    setErrorMsg("");
    setOfferHelp(false);
    setInvalidField(null);
  }, [isOpen]);

  // Ask the database for the current prices, coupon, shipping and stock whenever the bag
  // or coupon changes while checkout is open
  const quoteKey = JSON.stringify([toRpcItems(cartItems), appliedPromoCode ?? null]);
  const requestQuote = () => {
    const request = ++quoteRequest.current;
    setQuoteState({ status: "loading" });
    orderApi.quote(cartItems, appliedPromoCode).then((result) => {
      if (request !== quoteRequest.current) return;
      if (result.ok) setQuoteState({ status: "ready", quote: result.quote });
      else if (result.kind === "unavailable") setQuoteState({ status: "unavailable", quote: result.quote });
      else setQuoteState({ status: "error", message: result.message ?? "" });
    });
  };
  useEffect(() => {
    if (!isOpen || successOrder || cartItems.length === 0) return;
    requestQuote();
  }, [isOpen, quoteKey, successOrder]);

  const quote = quoteState.status === "ready" || quoteState.status === "unavailable" ? quoteState.quote : null;
  const quotedLine = useMemo(() => new Map((quote?.lines ?? []).map((l) => [`${l.productId}|${l.size}`, l])), [quote]);
  const cartName = (productId: string) => cartItems.find((it) => it.product.id === productId)?.product.name;

  const failValidation = (field: CheckoutField, message: string): false => {
    setErrorMsg(message);
    setInvalidField(field);
    document.getElementById(`checkout-${field}`)?.focus();
    return false;
  };

  // Props shared by every validated input: id, invalid state, and link to the message
  const fieldProps = (field: CheckoutField) => ({
    id: `checkout-${field}`,
    "aria-invalid": invalidField === field,
    "aria-describedby": invalidField === field ? "checkout-error" : undefined,
  });

  // Clear a field's error as soon as the shopper edits it
  const edited = (field: CheckoutField) => {
    if (invalidField === field) {
      setInvalidField(null);
      setErrorMsg("");
    }
  };

  // Validate form inputs (the database checks them again when placing the order)
  const validateForm = (): boolean => {
    setInvalidField(null);
    if (!customerName.trim()) {
      return failValidation("name", "Please enter your full name.");
    }
    if (!normalizeIndianMobile(customerPhone)) {
      return failValidation("phone", "Please enter a valid 10-digit Indian mobile number.");
    }
    if (customerEmail.trim() && !isValidEmail(customerEmail)) {
      return failValidation("email", "Please enter a valid email address, or leave it blank.");
    }
    if (address.trim().length < 5) {
      return failValidation("address", "Please provide your delivery street address.");
    }
    if (!city.trim()) {
      return failValidation("city", "Please enter your city.");
    }
    if (!state.trim()) {
      return failValidation("state", "Please enter your state.");
    }
    if (!isValidPincode(pincode)) {
      return failValidation("pincode", "Please enter a valid 6-digit Indian PIN code.");
    }
    if (cartItems.length === 0) {
      setErrorMsg("Your bag is empty. Add a piece before placing an order.");
      return false;
    }
    return true;
  };

  // Explain why nothing was placed. The bag is always kept.
  const showFailure = (result: PlaceOrderResult) => {
    switch (result.kind) {
      case "invalid_customer":
        failValidation(result.field, result.message);
        return;
      case "price_changed":
        setQuoteState({ status: "ready", quote: result.quote });
        break;
      case "unavailable":
        if (result.quote) setQuoteState({ status: "unavailable", quote: result.quote });
        onCatalogueChanged?.();
        break;
      case "idempotency_conflict":
        checkoutKeyRef.current = null;
        break;
      case "not_set_up":
      case "failed":
      case "uncertain":
      case "too_many_pending":
        setOfferHelp(true);
        break;
    }
    setErrorMsg(result.message ?? "");
  };

  // Place the COD order. Only once the database confirms it is the success screen shown,
  // and only then (when asked) is WhatsApp opened with the saved order.
  const placeOrder = async (sendOnWhatsApp: boolean) => {
    if (submittingRef.current) return;
    setErrorMsg("");
    setOfferHelp(false);
    if (!validateForm()) return;
    if (quoteState.status !== "ready") {
      setErrorMsg(
        quoteState.status === "loading"
          ? "Still checking current prices and stock. Please try again in a moment."
          : quoteState.status === "error"
            ? quoteState.message
            : "Some pieces in your bag aren't available in the quantity chosen. Please update your bag."
      );
      return;
    }

    submittingRef.current = true;
    setIsProcessing(true);
    checkoutKeyRef.current ??= newIdempotencyKey();
    const email = customerEmail.trim();
    try {
      const result = await placeOrderThen(
        orderApi,
        {
          idempotencyKey: checkoutKeyRef.current,
          cart: cartItems,
          customer: {
            name: customerName.trim(),
            phone: normalizeIndianMobile(customerPhone) ?? customerPhone.trim(),
            ...(email ? { email } : {}),
            address: address.trim(),
            city: city.trim(),
            state: state.trim(),
            pincode: pincode.trim(),
          },
          couponCode: appliedPromoCode,
          expectedTotal: quoteState.quote.total,
        },
        (order) => {
          checkoutKeyRef.current = null;
          setSuccessOrder(order);
          onOrderSuccess(order);
          // May be blocked by the browser; the success screen has the same link
          if (sendOnWhatsApp) window.open(orderService.whatsAppUrlForOrder(order), "_blank", "noopener,noreferrer");
        }
      );
      if (!result.ok) showFailure(result);
    } catch {
      setErrorMsg("We couldn't confirm your order. Please try again: if it was saved, you'll get the same order, not a second one.");
      setOfferHelp(true);
    } finally {
      submittingRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleConfirmCodOrder = (e: FormEvent) => {
    e.preventDefault();
    void placeOrder(false);
  };

  // WhatsApp link with the saved order's reference and the database's figures
  const successWhatsAppLink = useMemo(() => (successOrder ? orderService.whatsAppUrlForOrder(successOrder) : ""), [successOrder]);

  const canOrder = quoteState.status === "ready" && cartItems.length > 0 && !isProcessing;

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div key="checkout-modal" {...OVERLAY_MOTION.backdrop} className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6 bg-ink/50 backdrop-blur-xs font-sans">

      <motion.div ref={panelRef} tabIndex={-1} aria-labelledby="checkout-title" {...OVERLAY_MOTION.dialog} role="dialog" aria-modal="true" className="outline-none dialog-panel relative w-full max-w-4xl max-h-full flex flex-col bg-surface overflow-hidden">

        {/* Top Header */}
        {/* Stays in place while the content below scrolls */}
        <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-maroon-800 text-white flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <ShoppingBag className="w-4 h-4 text-gold-300" />
            <h2 id="checkout-title" className="font-serif text-base tracking-[0.18em] uppercase text-white">
              {successOrder ? "Order Placed" : `${BOUTIQUE_CONFIG.brandName} Checkout`}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="btn-icon rounded-xs text-white/80 hover:!text-white hover:!bg-white/10" aria-label="Close checkout"
            title="Close Checkout"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ====================================================
            SUCCESS CONFIRMATION SCREEN (only after the database saved the order)
            ==================================================== */}
        {successOrder ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-10 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-soft text-success">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="eyebrow block">
                Cash on Delivery order
              </span>
              <h3 className="heading-title mt-1">
                Dhanyawaad, {successOrder.customerName}!
              </h3>
              <p className="text-sm text-muted mt-2">
                Your order <strong className="tabular-nums text-ink">#{successOrder.reference}</strong> is placed and saved with the boutique. Please keep this reference.
              </p>
            </div>

            {/* Order Summary Box (the database's figures) */}
            <div className="max-w-md mx-auto panel-muted p-4 text-left text-xs space-y-2">
              <ul className="space-y-1 border-b border-line pb-2">
                {successOrder.items.map((it) => (
                  <li key={`${it.productId}-${it.selectedSize}`} className="flex justify-between gap-3">
                    <span className="min-w-0 text-ink">
                      {it.name} <span className="text-muted">· {it.selectedSize} · Qty {it.quantity}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatINR(it.price * it.quantity)}</span>
                  </li>
                ))}
              </ul>
              {successOrder.discount ? (
                <div className="flex justify-between text-ink-soft">
                  <span>Coupon {successOrder.couponCode}</span>
                  <span className="tabular-nums">-{formatINR(successOrder.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-ink-soft">
                <span>Delivery</span>
                <span className="tabular-nums">{successOrder.shippingCost ? formatINR(successOrder.shippingCost) : "Free"}</span>
              </div>
              <div className="flex justify-between font-semibold text-ink border-t border-line pt-2">
                <span>Total Amount Due on Delivery:</span>
                <span className="price">{formatINR(successOrder.total)}</span>
              </div>
              <div className="text-xs text-muted">
                <strong>Delivery Address:</strong> {successOrder.address}, {successOrder.city}, {successOrder.state} - {successOrder.pincode}
              </div>
              <div className="text-xs text-muted">
                <strong>Contact Number:</strong> {successOrder.customerPhone}
              </div>
            </div>

            {/* WhatsApp notification action */}
            <div className="max-w-md mx-auto space-y-3">
              <a
                href={successWhatsAppLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp btn-lg btn-block"
              >
                <MessageSquare className="w-4 h-4 fill-white" />
                <span>Send order details on WhatsApp</span>
              </a>
              <p className="text-xs text-muted">
                Optional: the boutique already has your order. Sending it on WhatsApp helps the team confirm it sooner. If you close WhatsApp without sending, your order is still placed; you don't need to order again.
              </p>

              <button
                onClick={onOpenInbox}
                className="btn btn-secondary btn-block"
              >
                View your orders
              </button>
              <button
                onClick={onClose}
                className="btn btn-ghost btn-block"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        ) : (
          /* ====================================================
             CHECKOUT FORM & ORDER SUMMARY
             ==================================================== */
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain grid grid-cols-1 lg:grid-cols-12">

            {/* Left Column: Delivery Details Form (7 cols) */}
            <form onSubmit={handleConfirmCodOrder} noValidate className="lg:col-span-7 p-4 min-[400px]:p-6 sm:p-8 space-y-4 border-b lg:border-b-0 lg:border-r border-line">

              <div>
                <h3 className="heading-label mb-1">
                  1. Delivery Details
                </h3>
                <p className="text-xs text-muted">
                  Please enter where your handcrafted outfits should be delivered.
                </p>
              </div>

              {errorMsg && (
                <div className="status-note status-note-danger" role="alert" id="checkout-error">
                  <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
                  <span>
                    {errorMsg}
                    {offerHelp && (
                      <>
                        {" "}
                        <a href={orderService.generateWhatsAppCheckoutHelpUrl()} target="_blank" rel="noopener noreferrer" className="link">
                          Ask the boutique on WhatsApp
                        </a>{" "}
                        (this is not an order).
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Customer Name */}
              <div>
                <label htmlFor="checkout-name" className="field-label">
                  Customer Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priya Sharma"
                  autoComplete="name"
                  value={customerName}
                  {...fieldProps("name")}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    edited("name");
                  }}
                  className="field field-touch"
                />
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="checkout-phone" className="field-label">
                    Phone Number (10 digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    autoComplete="tel-national"
                    inputMode="tel"
                    value={customerPhone}
                    {...fieldProps("phone")}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      edited("phone");
                    }}
                    className="field field-touch tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-email" className="field-label">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="priya@example.com"
                    autoComplete="email"
                    inputMode="email"
                    value={customerEmail}
                    {...fieldProps("email")}
                    onChange={(e) => {
                      setCustomerEmail(e.target.value);
                      edited("email");
                    }}
                    className="field field-touch"
                  />
                </div>
              </div>

              {/* Street Address */}
              <div>
                <label htmlFor="checkout-address" className="field-label">
                  Full Street Address & Landmark *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="House/Flat number, Building name, Street, Landmark"
                  autoComplete="street-address"
                  value={address}
                  {...fieldProps("address")}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    edited("address");
                  }}
                  className="field field-touch"
                />
              </div>

              {/* City, State, PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="checkout-city" className="field-label">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Bengaluru"
                    autoComplete="address-level2"
                    value={city}
                    {...fieldProps("city")}
                    onChange={(e) => {
                      setCity(e.target.value);
                      edited("city");
                    }}
                    className="field field-touch"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-state" className="field-label">
                    State *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Karnataka"
                    autoComplete="address-level1"
                    value={state}
                    {...fieldProps("state")}
                    onChange={(e) => {
                      setState(e.target.value);
                      edited("state");
                    }}
                    className="field field-touch"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-pincode" className="field-label">
                    PIN Code *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="560038"
                    autoComplete="postal-code"
                    inputMode="numeric"
                    value={pincode}
                    {...fieldProps("pincode")}
                    onChange={(e) => {
                      setPincode(e.target.value);
                      edited("pincode");
                    }}
                    className="field field-touch tabular-nums"
                  />
                </div>
              </div>

              {/* Payment Method (Cash on Delivery is the only one) */}
              <div className="pt-2">
                <h3 className="heading-label mb-2">
                  2. Payment Method
                </h3>
                <div className="p-3.5 rounded-xs border border-maroon-800 bg-maroon-800/5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 rounded-full border-4 border-maroon-800 bg-white"></div>
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        Cash on Delivery (COD)
                      </div>
                      <div className="text-xs text-muted">
                        Pay in cash or UPI when your outfit arrives at your doorstep.
                      </div>
                    </div>
                  </div>
                  <Truck className="w-4 h-4 text-maroon-800" />
                </div>
              </div>

              {/* Order Action Buttons */}
              <div className="pt-3 space-y-2.5">
                <div className="lg:hidden flex justify-between items-baseline text-sm font-semibold text-ink">
                  <span>Total payable</span>
                  <span className="price text-base">{quote && quoteState.status === "ready" ? formatINR(quote.total) : "—"}</span>
                </div>

                {/* 1. PLACE ORDER (COD) */}
                <button
                  type="submit"
                  disabled={!canOrder}
                  aria-busy={isProcessing}
                  className="btn btn-primary btn-lg btn-block"
                >
                  {isProcessing ? (
                    <span>Placing your order…</span>
                  ) : (
                    <span>Confirm Cash on Delivery Order</span>
                  )}
                </button>

                {/* 2. PLACE ORDER, THEN SEND IT ON WHATSAPP */}
                <button
                  type="button"
                  onClick={() => void placeOrder(true)}
                  disabled={!canOrder}
                  className="btn btn-whatsapp btn-lg btn-block"
                >
                  <MessageSquare className="w-4 h-4 fill-white" />
                  <span>Place order &amp; send on WhatsApp</span>
                </button>

                <p className="text-xs text-muted text-center">
                  Your order is saved with the boutique first. WhatsApp opens only after it is saved.
                </p>
              </div>

            </form>

            {/* Right Column: Order Summary (5 cols) */}
            <div className="lg:col-span-5 p-4 min-[400px]:p-6 sm:p-8 bg-canvas flex flex-col justify-between">

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <h3 className="heading-label">
                    Order Summary
                  </h3>
                  <span className="text-xs text-muted">
                    {cartItems.length} item{cartItems.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Items List (prices as the database quotes them) */}
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {cartItems.map((item) => {
                    const quoted = quotedLine.get(`${item.product.id}|${item.selectedSize}`);
                    return (
                      <div
                        key={item.product.id + item.selectedSize}
                        className="flex items-center space-x-3 text-xs"
                      >
                        <ProductImage src={getProductImage(item.product)} alt={item.product.name} className="w-12 h-15 object-cover shrink-0" compact />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif text-sm text-ink truncate" title={item.product.name}>
                            {item.product.name}
                          </h4>
                          <div className="text-xs text-muted mt-0.5">
                            Size: <strong className="text-ink">{item.selectedSize}</strong> • Qty: {item.quantity}
                          </div>
                          <div className="price text-xs mt-0.5">
                            {quoted ? formatINR(quoted.lineTotal) : quoteState.status === "loading" ? "…" : "—"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Costs Breakdown */}
                <div className="pt-3 border-t border-line space-y-2 text-xs" aria-live="polite">
                  {cartItems.length === 0 && <p className="text-muted">Your bag is empty.</p>}

                  {cartItems.length > 0 && quoteState.status === "loading" && (
                    <p className="flex items-center gap-2 text-muted">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      Checking current prices and stock…
                    </p>
                  )}

                  {quoteState.status === "error" && (
                    <div className="space-y-2">
                      <p className="text-danger">{quoteState.message}</p>
                      <button type="button" onClick={requestQuote} className="btn btn-secondary btn-sm">
                        Try again
                      </button>
                    </div>
                  )}

                  {quoteState.status === "unavailable" && (
                    <div className="status-note status-note-warning" role="status">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <ul className="space-y-1">
                        {quoteState.quote.problems.map((p) => (
                          <li key={`${p.productId}|${p.size}`}>{describeProblem(p, cartName(p.productId))}</li>
                        ))}
                        <li>Please update your bag to continue.</li>
                      </ul>
                    </div>
                  )}

                  {quote && (
                    <>
                      <div className="flex justify-between text-ink-soft">
                        <span>Subtotal:</span>
                        <span className="tabular-nums">{formatINR(quote.subtotal)}</span>
                      </div>

                      {quote.discount > 0 && (
                        <div className="flex justify-between text-danger">
                          <span>Promo Discount ({quote.couponCode}):</span>
                          <span className="tabular-nums">-{formatINR(quote.discount)}</span>
                        </div>
                      )}
                      {appliedPromoCode && quote.couponStatus === "invalid" && (
                        <p className="text-muted">Coupon {appliedPromoCode} isn't valid, so no discount is applied.</p>
                      )}
                      {appliedPromoCode && quote.couponStatus === "below_min_spend" && (
                        <p className="text-muted">
                          Coupon {appliedPromoCode} needs a minimum spend{quote.minimumSpend ? ` of ${formatINR(quote.minimumSpend)}` : ""}, so no discount is applied.
                        </p>
                      )}

                      <div className="flex justify-between text-ink-soft">
                        <span>Delivery Charges:</span>
                        <span className="tabular-nums">
                          {quote.shipping === 0 ? (
                            <strong className="badge badge-success">Free Delivery</strong>
                          ) : (
                            formatINR(quote.shipping)
                          )}
                        </span>
                      </div>

                      <div className="pt-3 border-t border-line flex justify-between items-baseline text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                        <span>Grand Total:</span>
                        <span className="price text-lg tracking-normal">
                          {formatINR(quote.total)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

              </div>

              {/* Trust Badge */}
              <div className="pt-4 mt-4 border-t border-line text-xs text-muted space-y-1">
                <div className="flex items-center space-x-1.5 text-ink font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-maroon-800" />
                  <span>Direct from the boutique</span>
                </div>
                <p>
                  Free shipping. Pay by cash or UPI on delivery.
                </p>
              </div>

            </div>

          </div>
        )}

      </motion.div>

    </motion.div>
      )}
    </AnimatePresence>
  );
}
