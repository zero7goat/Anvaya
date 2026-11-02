import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Banknote, Mail, Minus, Plus, Truck } from "lucide-react";
import { parseProductDetails } from "../utils/productDetails";
import { Product } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { getCollectionKey, getSizeOptions } from "../utils/productDisplay";
import { MOTION_TRANSITION } from "../utils/motion";

/**
 * Product page information block: service badges, expandable sections (details, care,
 * delivery, declaration) and a help panel. Only states facts held in the product record
 * or BOUTIQUE_CONFIG; anything not on record points the shopper to customer support.
 */
export default function ProductInfoSections({ product }: { product: Product }) {
  const collection = BOUTIQUE_CONFIG.collections[getCollectionKey(product)];
  const { supportPhone, supportEmail, supportHours } = BOUTIQUE_CONFIG;
  const codEnabled = BOUTIQUE_CONFIG.paymentMethods.some((m) => m.id === "cod" && m.enabled);
  const whatsappUrl = `https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber}`;
  const phoneHref = `tel:${supportPhone.replace(/\s+/g, "")}`;
  const { intro, details } = useMemo(() => parseProductDetails(product.description), [product.description]);
  // Only one section is open at a time; opening another closes the current one.
  // Product Details starts open, as it holds the description
  const [openSection, setOpenSection] = useState<string | null>("Product Details");
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
          Free shipping
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
          {intro && <ClampedText text={intro} />}
          {/* "Label: value." parts of the description, two to a row; pieces without them
              (only a paragraph) list their collection and style instead */}
          <dl className={`grid grid-cols-2 gap-x-6 gap-y-4 ${intro ? "mt-4" : ""}`}>
            {(details.length > 0
              ? details
              : [
                  { label: "Collection", value: `${collection.name} ${collection.byline}` },
                  { label: "Category", value: product.category },
                  ...(product.subcategory ? [{ label: "Style", value: product.subcategory }] : []),
                ]
            ).map((d, i) => (
              <div key={`${d.label}-${i}`}>
                <dt className="font-semibold text-ink">{d.label}</dt>
                <dd className="text-ink/85">{d.value}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold text-ink">Sizes</dt>
              <dd className="text-ink/85">{getSizeOptions(product).join(", ")}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Product code</dt>
              <dd className="text-ink/85">{product.id.toUpperCase()}</dd>
            </div>
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
            <li>Free shipping.</li>
            {codEnabled && <li>Cash on Delivery: pay by cash or UPI at your door.</li>}
            <li>You can cancel an order only before it is dispatched.</li>
            <li>No refunds.</li>
            <li>Returns are accepted only for damage, with a video of the unboxing, and if the piece hasn't been worn.</li>
            <li>
              <a href="/shipping-and-returns" className="link">
                Read the full policy
              </a>
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
          {open ? (
            <Minus className="w-4 h-4 shrink-0 text-ink" strokeWidth={3} aria-hidden="true" />
          ) : (
            <Plus className="w-4 h-4 shrink-0 text-ink" strokeWidth={3} aria-hidden="true" />
          )}
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

/** A paragraph cut to three lines, with "View more" when it is longer. */
function ClampedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);
  return (
    <div>
      <p ref={ref} className={expanded ? "" : "line-clamp-3"}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="link text-maroon-600 mt-1 cursor-pointer">
          {expanded ? "View less" : "View more"}
        </button>
      )}
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
