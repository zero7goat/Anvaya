import { Lock, MessageSquare, ShoppingBag, Truck } from "lucide-react";
import { BOUTIQUE_CONFIG } from "../../config";
import SectionHeader from "./SectionHeader";
import Reveal, { staggerDelay } from "../Reveal";

/**
 * Three steps from choosing a piece to delivery, built from the shop's stated terms
 * (online payment when it is on, else WhatsApp; delivery times from the Shipping &
 * Returns policy), with a WhatsApp line for anyone who wants to ask first.
 */
export default function HowToOrder() {
  const { collections, onlinePayment, whatsappNumber, supportHours } = BOUTIQUE_CONFIG;
  const steps = [
    {
      icon: ShoppingBag,
      title: "Choose your piece",
      text: `Browse ${collections.alankritha.name} kurtas and ${collections.ayanaa.name} sarees, pick your size and add it to your bag.`,
    },
    onlinePayment.enabled
      ? { icon: Lock, title: "Pay securely online", text: "UPI, debit or credit card, or net banking, through Razorpay's secure payment window." }
      : { icon: MessageSquare, title: "Send your bag on WhatsApp", text: "We confirm availability, the final amount and how to pay in the chat." },
    {
      icon: Truck,
      title: "Delivered to your door",
      text: "Usually dispatched within 3 to 5 working days, then delivered in 3 to 7. Free shipping across India.",
    },
  ];

  return (
    <section className="section-y bg-surface border-y border-line" id="how-to-order-section" aria-labelledby="how-to-order-title">
      <div className="container-page">
        <SectionHeader eyebrow="Simple and secure" title="How to Order" id="how-to-order-title" />
        <ol className="relative grid gap-6 sm:grid-cols-3 sm:gap-8">
          {/* Dotted line joining the steps on wider screens */}
          <span className="hidden sm:block absolute top-7 left-[16%] right-[16%] border-t border-dashed border-line-strong" aria-hidden="true" />
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="relative">
              <Reveal delay={staggerDelay(i, 3)} className="flex sm:flex-col items-start sm:items-center gap-4 sm:text-center">
                <span className="relative shrink-0 w-14 h-14 rounded-full bg-canvas border border-gold-300 flex items-center justify-center shadow-sm">
                  <Icon className="w-6 h-6 text-maroon-700" strokeWidth={1.5} aria-hidden="true" />
                  <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-maroon-800 text-white text-2xs font-bold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                </span>
                <div>
                  <h3 className="font-serif text-lg text-ink">{title}</h3>
                  <p className="text-sm text-muted mt-1 leading-relaxed max-w-xs sm:mx-auto">{text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-center text-sm text-ink-soft">
          Prefer to ask first?{" "}
          <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="link font-semibold">
            Chat with us on WhatsApp
          </a>{" "}
          <span className="text-muted">({supportHours})</span>
        </p>
      </div>
    </section>
  );
}
