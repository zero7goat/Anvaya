import { useEffect, useRef, useState, FormEvent, useMemo } from "react";
import {
  X, CheckCircle2, AlertCircle, Lock, MessageSquare, ShieldCheck, Loader2,
  Check, LocateFixed, Package, RotateCcw, Truck
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CartItem, Order } from "../types";
import { OVERLAY_MOTION } from "../utils/motion";
import { BOUTIQUE_CONFIG } from "../config";
import { orderService } from "../services/orderService";
import {
  orderApi, describeProblem, newIdempotencyKey, toRpcItems,
  type Quote
} from "../services/orderApi";
import {
  paymentApi, loadRazorpayCheckout,
  type RazorpaySuccess, type StartPaymentResult
} from "../services/paymentApi";
import ProductImage from "./ProductImage";
import { getProductImage } from "../data/imageRegistry";
import { useOverlay } from "../hooks/useOverlay";
import { isValidEmail, isValidPincode, normalizeIndianMobile } from "../utils/validation";
import { locateAddress, locationPermission, lookupPincode, type FoundAddress } from "../utils/addressLookup";
import { clearCheckoutDetails, loadCheckoutDetails, saveCheckoutDetails } from "../utils/savedCheckoutDetails";

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
  // Called only after the payment is confirmed and the database has the order as paid
  onOrderSuccess: (order: Order) => void;
  onOpenInbox?: () => void;
  // Called when stock changed underneath the shopper, so the storefront can refresh
  onCatalogueChanged?: () => void;
}

const formatINR = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

// Filling the address from the shopper's location
type LocationState = "idle" | "locating" | "filled" | "partial" | "denied" | "unavailable";
const LOCATION_NOTES: Record<LocationState, string> = {
  idle: "Fill your PIN code, city and state from your location, or type them below.",
  locating: "Asking your browser for your location…",
  filled: "Filled from your location (address data © OpenStreetMap). Please check them.",
  partial: "We found your city but not a PIN code here. Please type your PIN code.",
  denied: "Location is off for this site, so please type your PIN code.",
  unavailable: "Your location couldn't be found. Please type your PIN code.",
};
// The browser is asked automatically once per visit, when checkout opens with no PIN code
const LOCATION_ASKED_KEY = "anvaya_location_asked";

// Razorpay Checkout shows only UPI, cards and net banking (no wallets, EMI or pay later)
const PAYMENT_METHODS_SHOWN = {
  display: {
    blocks: {
      pay: { name: "Pay with", instruments: [{ method: "upi" }, { method: "card" }, { method: "netbanking" }] },
    },
    sequence: ["block.pay"],
    preferences: { show_default_blocks: false },
  },
};

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
  const [state, setState] = useState<string>("");
  const [pincode, setPincode] = useState<string>("");

  // Operational states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  // When ordering online failed, offer a WhatsApp message that is clearly not an order
  const [offerHelp, setOfferHelp] = useState(false);
  // Field that failed validation: highlighted, described by the message, and focused
  const [invalidField, setInvalidField] = useState<CheckoutField | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  // Shown while the server confirms a payment Razorpay reported as successful
  const [paymentNote, setPaymentNote] = useState("");
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

  // ---- Saved details (this device only), filled into empty fields when checkout opens
  const [rememberDetails, setRememberDetails] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const saved = loadCheckoutDetails();
    if (!saved) return;
    setRememberDetails(true);
    setCustomerName((v) => v || saved.name);
    setCustomerPhone((v) => v || saved.phone);
    setCustomerEmail((v) => v || saved.email);
    setAddress((v) => v || saved.address);
    setCity((v) => v || saved.city);
    setState((v) => v || saved.state);
    setPincode((v) => v || saved.pincode);
  }, [isOpen]);

  // ---- Address from the shopper's location, and city / state from the PIN code
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [pincodeNote, setPincodeNote] = useState("");
  // What was filled in automatically, so a later lookup may replace it but never the shopper's own typing
  const autoFilled = useRef<{ city?: string; state?: string }>({});
  const applyFound = (found: FoundAddress) => {
    if (found.pincode) setPincode(found.pincode);
    if (found.city) {
      setCity((v) => (!v.trim() || v === autoFilled.current.city ? found.city! : v));
      autoFilled.current.city = found.city;
    }
    if (found.state) {
      setState((v) => (!v.trim() || v === autoFilled.current.state ? found.state! : v));
      autoFilled.current.state = found.state;
    }
  };
  const fillFromLocation = async () => {
    setLocationState("locating");
    const result = await locateAddress();
    if ("address" in result) {
      applyFound(result.address);
      setLocationState(result.address.pincode ? "filled" : "partial");
    } else {
      setLocationState(result.reason === "denied" ? "denied" : "unavailable");
    }
  };
  useEffect(() => {
    if (!isOpen || successOrder || pincode) return;
    try {
      if (sessionStorage.getItem(LOCATION_ASKED_KEY) === "1") return;
    } catch {
      // Without storage it may ask again on a later visit; harmless
    }
    let cancelled = false;
    // A short pause lets the window settle before the browser's prompt appears; the visit is
    // marked as asked only when the question is really put
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(LOCATION_ASKED_KEY, "1");
      } catch {
        // See above
      }
      void locationPermission().then((permission) => {
        if (!cancelled && permission !== "denied") void fillFromLocation();
        else if (!cancelled) setLocationState("denied");
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen]);
  useEffect(() => {
    if (!isValidPincode(pincode)) {
      setPincodeNote("");
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void lookupPincode(pincode).then((found) => {
        if (!current) return;
        if (found) {
          applyFound(found);
          setPincodeNote([found.city, found.state].filter(Boolean).join(", "));
        } else {
          setPincodeNote("");
        }
      });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [pincode]);

  // ---- Confirmation: copy the order number
  const [copied, setCopied] = useState(false);
  const copyReference = async () => {
    if (!successOrder) return;
    try {
      await navigator.clipboard.writeText(successOrder.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copying isn't allowed here; the number is on screen
    }
  };

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
    if (!isValidPincode(pincode)) {
      return failValidation("pincode", "Please enter a valid 6-digit Indian PIN code.");
    }
    if (!city.trim()) {
      return failValidation("city", "Please enter your city.");
    }
    if (!state.trim()) {
      return failValidation("state", "Please enter your state.");
    }
    if (address.trim().length < 5) {
      return failValidation("address", "Please provide your house, street and landmark.");
    }
    if (cartItems.length === 0) {
      setErrorMsg("Your bag is empty. Add a piece before placing an order.");
      return false;
    }
    return true;
  };

  // Explain why nothing was placed. The bag is always kept.
  const showFailure = (result: Exclude<StartPaymentResult, { kind: "checkout" | "already_paid" }>) => {
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
      case "payment_unavailable":
        setOfferHelp(true);
        break;
    }
    setErrorMsg(result.message ?? "");
  };

  // Paid and confirmed by the server: show the confirmation, and the bag is done with
  const finishPaid = (order: Order) => {
    if (rememberDetails) {
      saveCheckoutDetails({ name: customerName.trim(), phone: customerPhone.trim(), email: customerEmail.trim(), address: address.trim(), city: city.trim(), state: state.trim(), pincode });
    } else {
      clearCheckoutDetails();
    }
    checkoutKeyRef.current = null;
    setErrorMsg("");
    setSuccessOrder(order);
    onOrderSuccess(order);
  };

  // Checkout's success reply goes to the server, which checks its signature before the
  // order counts as paid. The webhook records the payment too if this doesn't get through.
  const confirmPayment = async (order: Order, success: RazorpaySuccess) => {
    setPaymentNote("Confirming your payment…");
    try {
      const result = await paymentApi.verify(order.reference, success);
      if (result.ok) finishPaid(result.order);
      else setErrorMsg(result.message);
    } finally {
      setPaymentNote("");
    }
  };

  // Save the order (its pieces are held for the shopper), then pay for it in Razorpay
  // Checkout. Pressing Pay again after closing the payment window reuses the same order.
  const payOnline = async () => {
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
      const [started, Razorpay] = await Promise.all([
        paymentApi.start({
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
        }),
        loadRazorpayCheckout(),
      ]);
      if (started.kind !== "checkout") {
        if (started.kind === "already_paid") finishPaid(started.order);
        else showFailure(started);
        return;
      }
      const { order, checkout } = started;
      if (!Razorpay) {
        setErrorMsg(
          `Your order ${order.reference} is saved, but the payment window couldn't load. Check your connection and press Pay again; you won't get a second order.`
        );
        return;
      }

      // Wait while the payment window is open; the button stays busy until it closes
      await new Promise<void>((done) => {
        const razorpay = new Razorpay({
          key: checkout.keyId,
          amount: checkout.amount,
          currency: checkout.currency,
          order_id: checkout.razorpayOrderId,
          name: BOUTIQUE_CONFIG.brandName,
          description: `Order ${order.reference}`,
          prefill: { name: order.customerName, contact: order.customerPhone, ...(order.customerEmail ? { email: order.customerEmail } : {}) },
          notes: { reference: order.reference },
          theme: { color: "#3D0A0E" },
          config: PAYMENT_METHODS_SHOWN,
          handler: (success: RazorpaySuccess) => {
            void confirmPayment(order, success).finally(done);
          },
          modal: {
            ondismiss: () => {
              setErrorMsg(
                `Payment not completed. Your order ${order.reference} is saved and its pieces are held for you; press Pay again to finish paying.`
              );
              done();
            },
          },
        });
        // A failed attempt: the window stays open so the shopper can try another way
        razorpay.on("payment.failed", (response) => {
          const reason = response.error?.description;
          setErrorMsg(`Payment failed${reason ? `: ${reason}` : ""}. You can try again in the payment window.`);
        });
        razorpay.open();
      });
    } catch {
      setErrorMsg("We couldn't start the payment. Please try again: if your order was saved, you'll get the same order, not a second one.");
      setOfferHelp(true);
    } finally {
      submittingRef.current = false;
      setIsProcessing(false);
    }
  };

  const handlePay = (e: FormEvent) => {
    e.preventDefault();
    void payOnline();
  };

  // WhatsApp link with the saved order's reference and the database's figures
  const successWhatsAppLink = useMemo(() => (successOrder ? orderService.whatsAppUrlForOrder(successOrder) : ""), [successOrder]);

  const canOrder = quoteState.status === "ready" && cartItems.length > 0 && !isProcessing;
  const readyTotal = quoteState.status === "ready" ? quoteState.quote.total : null;

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div key="checkout-modal" {...OVERLAY_MOTION.backdrop} className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-6 bg-ink/45 font-sans">

      <motion.div
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby="checkout-title"
        {...OVERLAY_MOTION.dialog}
        role="dialog"
        aria-modal="true"
        className="outline-none relative w-full sm:max-w-5xl h-full sm:h-auto sm:max-h-full flex flex-col bg-canvas overflow-hidden sm:rounded-sm shadow-2xl"
      >

        {/* Header: secure checkout, the steps, close (stays put while the content scrolls) */}
        <div className="shrink-0 bg-maroon-950 text-white pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-0">
          <div className="px-4 sm:px-7 py-3.5 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Lock className="w-4 h-4 text-gold-300 shrink-0" aria-hidden="true" />
              <h2 id="checkout-title" className="font-serif text-lg sm:text-xl !text-white truncate">
                {successOrder ? "Order placed" : "Secure checkout"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="btn-icon -mr-2 !text-white/80 hover:!text-white hover:!bg-white/10"
              aria-label="Close checkout"
              title="Close checkout"
            >
              <X className="w-5 h-5" strokeWidth={1.6} />
            </button>
          </div>
          <CheckoutSteps current={successOrder ? 3 : isProcessing ? 2 : 1} />
        </div>

        {successOrder ? (
          /* ====================================================
             CONFIRMATION (only after the payment is confirmed)
             ==================================================== */
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-8 sm:p-10">
            <div className="max-w-xl mx-auto text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 18 } }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success text-white shadow-lg"
              >
                <CheckCircle2 className="w-9 h-9" strokeWidth={1.8} />
              </motion.div>
              <p className="eyebrow mt-5">Paid online</p>
              <h3 className="font-serif text-3xl text-ink mt-1">Dhanyawaad, {successOrder.customerName}!</h3>
              <p className="text-sm text-muted mt-2">
                Your payment is received and your order is placed with the boutique.
              </p>

              <div className="mt-5 inline-flex items-center gap-3 panel px-4 py-2.5">
                <span className="text-xs text-muted">Order number</span>
                <span className="font-semibold tabular-nums text-ink">{successOrder.reference}</span>
                <button type="button" onClick={copyReference} className="link text-xs">
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* What happens next (times from the Shipping & Returns policy) */}
            <ol className="max-w-xl mx-auto mt-8 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                { icon: CheckCircle2, title: "Confirmed", text: "The boutique confirms your order" },
                { icon: Package, title: "Dispatched", text: "Usually within 3 to 5 working days" },
                { icon: Truck, title: "Delivered", text: "3 to 7 working days after dispatch" },
              ].map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex flex-col items-center gap-1.5">
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center ${i === 0 ? "bg-maroon-700 text-white" : "bg-surface-muted text-ink-soft"}`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="font-semibold text-ink">{title}</span>
                  <span className="text-muted leading-snug">{text}</span>
                </li>
              ))}
            </ol>

            {/* Order summary (the database's figures) */}
            <div className="max-w-xl mx-auto mt-8 panel p-4 sm:p-5 text-sm space-y-3">
              <ul className="space-y-3">
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
                <div className="flex justify-between text-ink-soft border-t border-line pt-3">
                  <span>Coupon {successOrder.couponCode}</span>
                  <span className="tabular-nums">-{formatINR(successOrder.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-semibold text-ink border-t border-line pt-3">
                <span>Total paid</span>
                <span className="tabular-nums">{formatINR(successOrder.total)}</span>
              </div>
              <p className="text-xs text-muted">
                Delivering to {successOrder.address}, {successOrder.city}, {successOrder.state} - {successOrder.pincode} · {successOrder.customerPhone}
              </p>
            </div>

            <div className="max-w-xl mx-auto mt-6 space-y-3">
              <a href={successWhatsAppLink} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-lg btn-block">
                <MessageSquare className="w-4 h-4 fill-white" />
                <span>Send order details on WhatsApp</span>
              </a>
              <p className="text-xs text-muted text-center">
                Optional: the boutique already has your order. Sending it on WhatsApp helps the team confirm it sooner.
              </p>
              {onOpenInbox && (
                <button onClick={onOpenInbox} className="btn btn-secondary btn-block">
                  View your orders
                </button>
              )}
              <button onClick={onClose} className="btn btn-ghost btn-block">
                Continue shopping
              </button>
            </div>
          </div>
        ) : (
          /* ====================================================
             DETAILS, PAYMENT AND ORDER SUMMARY
             ==================================================== */
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_23rem]">

            <form id="checkout-form" onSubmit={handlePay} noValidate className="order-2 lg:order-1 px-4 py-6 sm:px-7 sm:py-7 space-y-7">

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

              {/* 1. Contact */}
              <fieldset className="space-y-3">
                <legend className="checkout-section-title">
                  <span className="checkout-step-number">1</span> Contact
                </legend>
                <div>
                  <label htmlFor="checkout-name" className="field-label">Full name *</label>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="checkout-phone" className="field-label">Mobile number *</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 border border-r-0 border-line-strong rounded-l-xs bg-surface-muted text-sm text-ink-soft select-none" aria-hidden="true">
                        +91
                      </span>
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
                        className="field field-touch tabular-nums rounded-l-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="checkout-email" className="field-label">Email (optional)</label>
                    <input
                      type="email"
                      placeholder="For your order confirmation"
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
              </fieldset>

              {/* 2. Delivery address */}
              <fieldset className="space-y-3">
                <legend className="checkout-section-title">
                  <span className="checkout-step-number">2</span> Delivery address
                </legend>

                {/* Fill the PIN code, city and state from the shopper's location */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-dashed border-line-strong bg-surface px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => void fillFromLocation()}
                    disabled={locationState === "locating"}
                    className="btn btn-secondary btn-sm"
                  >
                    {locationState === "locating" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {locationState === "locating" ? "Finding you…" : "Use my current location"}
                  </button>
                  <span className="text-xs text-muted flex-1 min-w-[12rem]" aria-live="polite">
                    {LOCATION_NOTES[locationState]}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="checkout-pincode" className="field-label">PIN code *</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="6 digits"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      value={pincode}
                      {...fieldProps("pincode")}
                      onChange={(e) => {
                        setPincode(e.target.value.replace(/\D/g, "").slice(0, 6));
                        edited("pincode");
                      }}
                      className="field field-touch tabular-nums"
                    />
                    {pincodeNote && <p className="field-help !text-success mt-1">{pincodeNote}</p>}
                  </div>
                  <div>
                    <label htmlFor="checkout-city" className="field-label">City / district *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ballari"
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
                    <label htmlFor="checkout-state" className="field-label">State *</label>
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
                </div>

                <div>
                  <label htmlFor="checkout-address" className="field-label">House, street and landmark *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="House / flat number, building, street, area, landmark"
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

                <label className="flex items-center gap-2.5 text-sm text-ink-soft cursor-pointer select-none">
                  <input type="checkbox" className="checkbox" checked={rememberDetails} onChange={(e) => setRememberDetails(e.target.checked)} />
                  Save these details on this device for next time
                </label>
              </fieldset>

              {/* 3. Payment */}
              <fieldset className="space-y-3">
                <legend className="checkout-section-title">
                  <span className="checkout-step-number">3</span> Payment
                </legend>
                <div className="rounded-sm border-2 border-maroon-700 bg-maroon-700/[0.04] p-4 flex items-start gap-3">
                  <span className="mt-0.5 w-4 h-4 rounded-full border-[5px] border-maroon-700 bg-white shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">Pay online</p>
                    <p className="text-xs text-muted mt-0.5">UPI, debit or credit card, or net banking, in Razorpay's secure payment window.</p>
                    <ul className="mt-2.5 flex flex-wrap gap-1.5 text-2xs font-semibold text-ink-soft">
                      {["UPI", "Cards", "Net banking"].map((method) => (
                        <li key={method} className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5">{method}</li>
                      ))}
                    </ul>
                  </div>
                  <ShieldCheck className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  Secured by Razorpay. Your card and bank details never reach us.
                </p>
              </fieldset>

              {/* Pay (wider screens; phones use the bar at the bottom) */}
              <div className="hidden sm:block space-y-2.5">
                <PayButton canOrder={canOrder} isProcessing={isProcessing} paymentNote={paymentNote} total={readyTotal} />
                <p className="text-xs text-muted text-center">
                  Your pieces are held for you while you pay, and your order is confirmed once paid.
                </p>
              </div>
            </form>

            {/* Order summary (prices as the database quotes them) */}
            <aside aria-label="Order summary" className="order-1 lg:order-2 bg-surface border-b lg:border-b-0 lg:border-l border-line px-4 py-5 sm:px-7 sm:py-7 lg:sticky lg:top-0 lg:self-start lg:max-h-full lg:overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <h3 className="heading-label">Order summary</h3>
                <span className="text-xs text-muted">
                  {cartItems.reduce((sum, item) => sum + item.quantity, 0)} {cartItems.reduce((sum, item) => sum + item.quantity, 0) === 1 ? "piece" : "pieces"}
                </span>
              </div>

              <ul className="py-4 space-y-3 max-h-60 lg:max-h-72 overflow-y-auto">
                {cartItems.map((item) => {
                  const quoted = quotedLine.get(`${item.product.id}|${item.selectedSize}`);
                  return (
                    <li key={item.product.id + item.selectedSize} className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <ProductImage src={getProductImage(item.product)} alt={item.product.name} className="w-14 aspect-[3/4] object-cover rounded-xs" compact />
                        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-ink text-white text-2xs font-semibold flex items-center justify-center tabular-nums">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-serif text-sm text-ink line-clamp-2">{item.product.name}</p>
                        <p className="text-xs text-muted mt-0.5">Size {item.selectedSize}</p>
                      </div>
                      <span className="text-sm tabular-nums text-ink shrink-0">
                        {quoted ? formatINR(quoted.lineTotal) : quoteState.status === "loading" ? "…" : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="pt-4 border-t border-line space-y-2 text-sm" aria-live="polite">
                {cartItems.length === 0 && <p className="text-muted">Your bag is empty.</p>}

                {cartItems.length > 0 && quoteState.status === "loading" && (
                  <p className="flex items-center gap-2 text-muted text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    Checking current prices and stock…
                  </p>
                )}

                {quoteState.status === "error" && (
                  <div className="space-y-2">
                    <p className="text-danger text-xs">{quoteState.message}</p>
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
                      <span>Subtotal</span>
                      <span className="tabular-nums text-ink">{formatINR(quote.subtotal)}</span>
                    </div>
                    {quote.discount > 0 && (
                      <div className="flex justify-between text-success">
                        <span>Coupon {quote.couponCode}</span>
                        <span className="tabular-nums">-{formatINR(quote.discount)}</span>
                      </div>
                    )}
                    {appliedPromoCode && quote.couponStatus === "invalid" && (
                      <p className="text-xs text-muted">Coupon {appliedPromoCode} isn't valid, so no discount is applied.</p>
                    )}
                    {appliedPromoCode && quote.couponStatus === "below_min_spend" && (
                      <p className="text-xs text-muted">
                        Coupon {appliedPromoCode} needs a minimum spend{quote.minimumSpend ? ` of ${formatINR(quote.minimumSpend)}` : ""}, so no discount is applied.
                      </p>
                    )}
                    <div className="flex justify-between text-ink-soft">
                      <span>Delivery</span>
                      <span className="font-semibold text-success">{quote.shipping === 0 ? "Free" : formatINR(quote.shipping)}</span>
                    </div>
                    <div className="pt-3 border-t border-line flex justify-between items-baseline text-ink">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em]">Total</span>
                      <span className="font-serif text-2xl tabular-nums">{formatINR(quote.total)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Reassurance from the shop's stated terms */}
              <ul className="hidden lg:block mt-6 pt-5 border-t border-line space-y-2.5 text-xs text-ink-soft">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-maroon-600 shrink-0" aria-hidden="true" />
                  Secure payment by Razorpay
                </li>
                <li className="flex items-start gap-2.5">
                  <Truck className="w-4 h-4 text-maroon-600 shrink-0" aria-hidden="true" />
                  Free delivery across India, dispatched in 3 to 5 working days
                </li>
                <li className="flex items-start gap-2.5">
                  <RotateCcw className="w-4 h-4 text-maroon-600 shrink-0" aria-hidden="true" />
                  <span>
                    Refunds for orders cancelled before dispatch.{" "}
                    <a href="/shipping-and-returns" target="_blank" rel="noopener noreferrer" className="link">Policy</a>
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MessageSquare className="w-4 h-4 text-maroon-600 shrink-0" aria-hidden="true" />
                  <span>
                    Questions?{" "}
                    <a href={`https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="link">
                      Chat on WhatsApp
                    </a>{" "}
                    ({BOUTIQUE_CONFIG.supportHours})
                  </span>
                </li>
              </ul>
            </aside>
          </div>
        )}

        {/* Phones: total and Pay stay at the bottom */}
        {!successOrder && (
          <div className="sm:hidden shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.06)]">
            <PayButton canOrder={canOrder} isProcessing={isProcessing} paymentNote={paymentNote} total={readyTotal} form="checkout-form" />
          </div>
        )}

      </motion.div>

    </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Bag → Delivery → Payment → Confirmed; `current` is the step being done (0-based) */
function CheckoutSteps({ current }: { current: number }) {
  const steps = ["Bag", "Delivery", "Payment", "Confirmed"];
  return (
    <ol className="flex items-center gap-1 px-4 sm:px-7 pb-3 text-2xs font-semibold uppercase tracking-[0.12em]" aria-label="Checkout steps">
      {steps.map((step, i) => {
        const done = i < current || (current === 3 && i === 3);
        const active = i === current && current !== 3;
        return (
          <li key={step} className="flex items-center gap-1 min-w-0" aria-current={active ? "step" : undefined}>
            <span
              className={`flex items-center gap-1.5 ${done ? "text-gold-300" : active ? "text-white" : "text-white/45"}`}
            >
              {done ? <Check className="w-3 h-3" aria-hidden="true" /> : <span className="tabular-nums">{i + 1}.</span>}
              {/* Phones name only the current step, so the row fits */}
              <span className={active ? "" : "hidden sm:inline"}>{step}</span>
            </span>
            {i < steps.length - 1 && <span className="w-4 sm:w-8 h-px bg-white/25 mx-1" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/** The Pay button, with the total; `form` links the phone bar's button to the form */
function PayButton({
  canOrder,
  isProcessing,
  paymentNote,
  total,
  form,
}: {
  canOrder: boolean;
  isProcessing: boolean;
  paymentNote: string;
  total: number | null;
  form?: string;
}) {
  return (
    <button type="submit" form={form} disabled={!canOrder} aria-busy={isProcessing} className="btn btn-primary btn-lg btn-block">
      {isProcessing ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>{paymentNote || "Waiting for payment…"}</span>
        </>
      ) : (
        <>
          <Lock className="w-4 h-4" aria-hidden="true" />
          <span>{total !== null ? `Pay ${formatINR(total)} securely` : "Pay securely"}</span>
        </>
      )}
    </button>
  );
}
