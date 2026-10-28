import { useEffect, useRef, useState, FormEvent, useMemo } from "react";
import { 
  X, CheckCircle2, AlertCircle, ShoppingBag, Truck, 
  MessageSquare, ArrowRight, ShieldCheck, Phone, MapPin
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CartItem, Order, Product } from "../types";
import { OVERLAY_MOTION } from "../utils/motion";
import { BOUTIQUE_CONFIG } from "../config";
import { orderService } from "../services/orderService";
import { productService } from "../services/productService";
import ProductImage from "./ProductImage";
import { getProductImage } from "../data/imageRegistry";
import { offerService } from "../services/offerService";
import { calculateCartTotals, getUnitPrice } from "../utils/pricing";
import { useOverlay } from "../hooks/useOverlay";
import { isValidEmail, isValidPincode, normalizeIndianMobile } from "../utils/validation";

type CheckoutField = "name" | "phone" | "email" | "address" | "city" | "state" | "pincode";


interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  // Coupon chosen in the bag; re-checked here against the cart being ordered
  appliedPromoCode?: string;
  onOrderSuccess: (order: Order, updatedProducts: Product[]) => void;
  onOpenInbox: () => void;
  // Called when stock changed underneath the shopper, so the storefront can refresh
  onCatalogueChanged?: () => void;
}

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
  // Recipient Shipping fields
  const [customerName, setCustomerName] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [state, setState] = useState<string>("Karnataka");
  const [pincode, setPincode] = useState<string>("");

  // Payment Selection (Defaults to Cash on Delivery)
  const [paymentMethod, setPaymentMethod] = useState<"COD">("COD");

  // Operational states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Field that failed validation: highlighted, described by the message, and focused
  const [invalidField, setInvalidField] = useState<CheckoutField | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  // Pricing: the same rules as the bag, with the coupon re-checked for this cart
  const offer = useMemo(
    () => (appliedPromoCode ? offerService.findActiveOfferByCode(appliedPromoCode) : null),
    [appliedPromoCode]
  );
  const { subtotal, discount: discountAmount, shipping: shippingCost, total: grandTotal, appliedOffer } = calculateCartTotals(
    cartItems,
    offer,
    BOUTIQUE_CONFIG
  );

  // A fresh checkout every time it opens (not the previous order's confirmation)
  useEffect(() => {
    if (!isOpen) return;
    setSuccessOrder(null);
    setErrorMsg("");
    setInvalidField(null);
  }, [isOpen]);

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

  // Validate form inputs
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
    if (!address.trim()) {
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

  // WhatsApp Direct Order Action
  const handleWhatsAppOrder = () => {
    setErrorMsg("");
    if (!validateForm()) return;

    const { url } = orderService.generateWhatsAppOrderUrl({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      items: cartItems.map(it => ({
        name: it.product.name,
        selectedSize: it.selectedSize,
        quantity: it.quantity,
        price: getUnitPrice(it.product)
      })),
      subtotal,
      discount: discountAmount,
      couponCode: appliedOffer?.code,
      shippingCost,
      grandTotal
    });

    // Open WhatsApp in new tab for customer to review and send
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Confirm Standard Cash on Delivery Order
  const handleConfirmCodOrder = (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setErrorMsg("");
    if (!validateForm()) return;

    submittingRef.current = true;
    setIsProcessing(true);

    // Brief pause so the button state is visible; everything happens in this browser
    setTimeout(() => {
      try {
        // Reserve stock first: if any piece sold out meanwhile, nothing is ordered
        const stockReserved = productService.depleteStock(
          cartItems.map(it => ({
            productId: it.product.id,
            selectedSize: it.selectedSize,
            quantity: it.quantity
          }))
        );
        if (!stockReserved) {
          setErrorMsg("Some pieces in your bag are no longer available in the quantity chosen. Your bag has been updated; please review it before ordering.");
          onCatalogueChanged?.();
          return;
        }

        const newOrder = orderService.createOrder({
          customerName: customerName.trim(),
          customerPhone: normalizeIndianMobile(customerPhone) || customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          items: cartItems.map(it => ({
            productId: it.product.id,
            name: it.product.name,
            price: getUnitPrice(it.product),
            quantity: it.quantity,
            selectedSize: it.selectedSize
          })),
          subtotal,
          discount: discountAmount,
          couponCode: appliedOffer?.code,
          shippingCost,
          total: grandTotal,
          paymentMethod: "COD",
          paymentStatus: "COD - Due",
          status: "Pending"
        });

        setSuccessOrder(newOrder);
        const updatedProducts = productService.getProducts({ includeDisabled: true });
        onOrderSuccess(newOrder, updatedProducts);
      } catch {
        setErrorMsg("Something went wrong while placing your order. Nothing was charged; please try again.");
      } finally {
        submittingRef.current = false;
        setIsProcessing(false);
      }
    }, 600);
  };

  // Formatted WhatsApp confirmation link for the success screen
  const successWhatsAppLink = useMemo(() => {
    if (!successOrder) return "";
    const { url } = orderService.generateWhatsAppOrderUrl({
      customerName: successOrder.customerName,
      customerPhone: successOrder.customerPhone,
      address: successOrder.address,
      city: successOrder.city,
      state: successOrder.state,
      pincode: successOrder.pincode,
      items: successOrder.items.map(it => ({
        name: it.name,
        selectedSize: it.selectedSize,
        quantity: it.quantity,
        price: it.price
      })),
      // The order's own figures: the bag is already empty by now
      subtotal: successOrder.subtotal ?? successOrder.items.reduce((sum, it) => sum + it.price * it.quantity, 0),
      shippingCost: successOrder.shippingCost ?? 0,
      discount: successOrder.discount,
      couponCode: successOrder.couponCode,
      grandTotal: successOrder.total,
      orderId: successOrder.id
    });
    return url;
  }, [successOrder]);

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
              {successOrder ? "Order Placed" : "Alankritha Checkout"}
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
            SUCCESS CONFIRMATION SCREEN
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
                Your order <strong className="tabular-nums text-ink">#{successOrder.id}</strong> is saved on this device. Send it to the boutique on WhatsApp below so the team can confirm it.
              </p>
            </div>

            {/* Order Summary Box */}
            <div className="max-w-md mx-auto panel-muted p-4 text-left text-xs space-y-2">
              <div className="flex justify-between font-semibold text-ink border-b border-line pb-2">
                <span>Total Amount Due on Delivery:</span>
                <span className="price">₹{successOrder.total.toLocaleString("en-IN")}</span>
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
                <span>Notify Boutique via WhatsApp</span>
              </a>

              <button
                onClick={onClose}
                className="btn btn-secondary btn-block"
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
                  <span>{errorMsg}</span>
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
                  className="field"
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
                    className="field tabular-nums"
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
                    className="field"
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
                  className="field"
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
                    className="field"
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
                    className="field"
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
                    className="field tabular-nums"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
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

              {/* Dual Order Action Buttons */}
              <div className="pt-3 space-y-2.5">
                <div className="lg:hidden flex justify-between items-baseline text-sm font-semibold text-ink">
                  <span>Total payable</span>
                  <span className="price text-base">₹{grandTotal.toLocaleString("en-IN")}</span>
                </div>

                {/* 1. WHATSAPP ORDER BUTTON (Prefilled formatted URL) */}
                <button
                  type="button"
                  onClick={handleWhatsAppOrder}
                  disabled={cartItems.length === 0}
                  className="btn btn-whatsapp btn-lg btn-block"
                  title="Generate a formatted WhatsApp message with your items and delivery address"
                >
                  <MessageSquare className="w-4 h-4 fill-white" />
                  <span>Order via WhatsApp (Instant Review)</span>
                </button>

                {/* 2. CONFIRM COD ORDER BUTTON */}
                <button
                  type="submit"
                  disabled={isProcessing || cartItems.length === 0}
                  aria-busy={isProcessing}
                  className="btn btn-primary btn-lg btn-block"
                >
                  {isProcessing ? (
                    <span>Processing Order...</span>
                  ) : (
                    <span>Confirm Cash on Delivery Order</span>
                  )}
                </button>

                <p className="text-xs text-muted text-center">
                  You can review and send the message on WhatsApp, or confirm online with Cash on Delivery.
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

                {/* Items List */}
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {cartItems.map((item) => {
                    const price = getUnitPrice(item.product);
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
                            ₹{(price * item.quantity).toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Costs Breakdown */}
                <div className="pt-3 border-t border-line space-y-2 text-xs">
                  <div className="flex justify-between text-ink-soft">
                    <span>Subtotal:</span>
                    <span className="tabular-nums">₹{subtotal.toLocaleString("en-IN")}</span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-danger">
                      <span>Promo Discount ({appliedOffer?.code}):</span>
                      <span className="tabular-nums">-₹{discountAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-ink-soft">
                    <span>Delivery Charges:</span>
                    <span className="tabular-nums">
                      {shippingCost === 0 ? (
                        <strong className="badge badge-success">Free Delivery</strong>
                      ) : (
                        `₹${shippingCost}`
                      )}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-line flex justify-between items-baseline text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                    <span>Grand Total:</span>
                    <span className="price text-lg tracking-normal">
                      ₹{grandTotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

              </div>

              {/* Trust Badge */}
              <div className="pt-4 mt-4 border-t border-line text-xs text-muted space-y-1">
                <div className="flex items-center space-x-1.5 text-ink font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-maroon-800" />
                  <span>Direct from the boutique</span>
                </div>
                <p>
                  Free shipping on orders of ₹{BOUTIQUE_CONFIG.freeShippingThreshold.toLocaleString("en-IN")} or more. Pay by cash or UPI on delivery.
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
