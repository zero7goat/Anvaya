import { ReactNode, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Banknote, Mail, Plus, Truck } from "lucide-react";
import { Product } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { formatINR, getCollectionKey, getSizeOptions } from "../utils/productDisplay";
import { MOTION_TRANSITION } from "../utils/motion";

/**
 * Product page information block: service badges, expandable sections (details, care,
 * delivery, declaration) and a help panel. Only states facts held in the product record
 * or BOUTIQUE_CONFIG; anything not on record points the shopper to customer support.
 */
export default function ProductInfoSections({ product }: { product: Product }) {
  const collection = BOUTIQUE_CONFIG.collections[getCollectionKey(product)];
  const { supportPhone, supportEmail, supportHours, freeShippingThreshold, standardShippingFee } =
    BOUTIQUE_CONFIG;
  const codEnabled = BOUTIQUE_CONFIG.paymentMethods.some((m) => m.id === "cod" && m.enabled);
  const whatsappUrl = `https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber}`;
  const phoneHref = `tel:${supportPhone.replace(/\s+/g, "")}`;
  // Only one section is open at a time; opening another closes the current one
  const [openSection, setOpenSection] = useState<string | null>(null);
  const sectionProps = (title: string) => ({
    title,
    open: openSection === title,
    onToggle: () => setOpenSection(openSection === title ? null : title),
  });

  return (
    <div className="space-y-6" id="product-info-sections">
      {/* Service badges (phones show these in the service row under the price instead) */}
      <ul className="hidden md:flex flex-wrap gap-x-8 gap-y-3 text-sm text-ink">
        <li className="flex items-center gap-2.5">
          <Truck className="w-5 h-5 text-maroon-600" strokeWidth={1.5} aria-hidden="true" />
          Free shipping above {formatINR(freeShippingThreshold)}
        </li>
        {codEnabled && (
          <li className="flex items-center gap-2.5">
            <Banknote className="w-5 h-5 text-maroon-600" strokeWidth={1.5} aria-hidden="true" />
            COD Available
          </li>
        )}
      </ul>

      {/* Expandable sections */}
      <div className="border-t border-line">
        <InfoSection {...sectionProps("Product Details")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            <DetailRow label="Collection">
              {collection.name} {collection.byline}
            </DetailRow>
            <DetailRow label="Category">{product.category}</DetailRow>
            {product.subcategory && <DetailRow label="Style">{product.subcategory}</DetailRow>}
            <DetailRow label="Sizes">{getSizeOptions(product).join(", ")}</DetailRow>
            <DetailRow label="Product code">{product.id.toUpperCase()}</DetailRow>
          </dl>
        </InfoSection>

        <InfoSection {...sectionProps("Wash & Care")}>
          <p>
            Care instructions for this piece are not listed online yet. Please check with us before the first wash,
            especially for silk, zari and embroidered pieces.
          </p>
          <p className="mt-2">
            Ask on{" "}
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="link">
              WhatsApp
            </a>
            {supportEmail ? (
              <>
                {" "}
                or email{" "}
                <a href={`mailto:${supportEmail}`} className="link">
                  {supportEmail}
                </a>
              </>
            ) : (
              <>
                {" "}
                or call <a href={phoneHref} className="link">{supportPhone}</a>
              </>
            )}
            .
          </p>
        </InfoSection>

        <InfoSection {...sectionProps("Delivery & Returns")}>
          <ul className="space-y-1.5 list-disc pl-4">
            <li>Delivering across India.</li>
            <li>
              Free shipping on orders of {formatINR(freeShippingThreshold)} or more; {formatINR(standardShippingFee)}{" "}
              on smaller orders.
            </li>
            {codEnabled && <li>Cash on Delivery: pay by cash or UPI at your door.</li>}
            <li>
              For returns or exchanges, contact us on{" "}
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="link">
                WhatsApp
              </a>{" "}
              or {supportEmail ? "by email" : "by phone"} with your order details.
            </li>
          </ul>
        </InfoSection>

        <InfoSection {...sectionProps("Product Declaration")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            <DetailRow label="Brand">{BOUTIQUE_CONFIG.brandName}</DetailRow>
            <DetailRow label="Product">{product.name}</DetailRow>
            <DetailRow label="Product code">{product.id.toUpperCase()}</DetailRow>
            <DetailRow label="Net quantity">1 piece</DetailRow>
            <DetailRow label="Customer care">
              {supportEmail ? `${supportPhone} · ${supportEmail}` : supportPhone}
            </DetailRow>
          </dl>
        </InfoSection>
      </div>

      {/* Help */}
      <div id="product-help">
        <h2 className="font-sans text-base font-bold uppercase tracking-[0.04em] text-ink">
          Have a question? We are here to help!
        </h2>
        <p className="mt-2 text-sm text-ink/85 leading-relaxed">
          We are available on{" "}
          <a href={phoneHref} className="underline underline-offset-2 hover:text-maroon-700">
            {supportPhone}
          </a>
          , {supportHours}.
        </p>
        {supportEmail && (
          <p className="mt-4 flex items-center gap-2.5 text-sm text-ink/85">
            <Mail className="w-5 h-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>
              Email us at{" "}
              <a href={`mailto:${supportEmail}`} className="underline underline-offset-2 hover:text-maroon-700">
                {supportEmail}
              </a>
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

/** One expandable section; its body slides open and closed smoothly. */
function InfoSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = `product-info-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="border-b border-line">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="w-full flex items-center justify-between gap-4 py-5 text-left cursor-pointer"
        >
          <span className="text-sm font-bold uppercase tracking-[0.12em] text-ink">{title}</span>
          <Plus
            className={`w-4 h-4 shrink-0 text-ink transition-transform duration-300 ${open ? "rotate-45" : ""}`}
            strokeWidth={3}
            aria-hidden="true"
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: MOTION_TRANSITION.base }}
            exit={{ height: 0, opacity: 0, transition: MOTION_TRANSITION.fast }}
            className="overflow-hidden"
          >
            <div className="pb-5 -mt-1 text-sm text-ink/85 leading-relaxed">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </>
  );
}
