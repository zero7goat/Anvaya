import { Banknote, MapPin, MessageSquare, Truck } from "lucide-react";
import { BOUTIQUE_CONFIG } from "../../config";
import { formatINR } from "../../utils/productDisplay";

/**
 * Slim row of the shop's real service terms, straight from the business config:
 * free-shipping threshold, cash on delivery, WhatsApp help and delivery area.
 */
export default function ServiceStrip() {
  const cod = BOUTIQUE_CONFIG.paymentMethods.find((m) => m.enabled);
  const items = [
    {
      icon: Truck,
      title: `Free shipping from ${formatINR(BOUTIQUE_CONFIG.freeShippingThreshold)}`,
      detail: `${formatINR(BOUTIQUE_CONFIG.standardShippingFee)} on smaller orders`,
    },
    ...(cod ? [{ icon: Banknote, title: "Cash on Delivery", detail: "Pay by cash or UPI at your door" }] : []),
    {
      icon: MessageSquare,
      title: "Order on WhatsApp",
      detail: BOUTIQUE_CONFIG.supportHours,
      href: `https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber}`,
    },
    {
      icon: MapPin,
      title: "Delivering across India",
    },
  ];

  return (
    <section aria-label="Shopping with Anvaya" className="bg-surface border-b border-line" id="service-strip">
      <ul className="container-page grid grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, detail, href }, i) => {
          const body = (
            <>
              <Icon className="w-5 h-5 text-gold-700 shrink-0" strokeWidth={1.6} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs sm:text-sm font-semibold text-ink">{title}</span>
                {detail && <span className="block text-2xs sm:text-xs text-muted mt-0.5">{detail}</span>}
              </span>
            </>
          );
          return (
            <li
              key={title}
              className={`py-4 sm:py-5 px-2 sm:px-4 ${i % 2 === 1 ? "border-l border-line" : ""} ${
                i >= 2 ? "border-t lg:border-t-0 border-line" : ""
              } ${i === 2 ? "lg:border-l" : ""}`}
            >
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 group">
                  {body}
                </a>
              ) : (
                <div className="flex items-start gap-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
