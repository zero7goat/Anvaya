import React, { ReactNode } from "react";
import { MessageSquare, Mail, Banknote, MapPin } from "lucide-react";
import { BOUTIQUE_CONFIG } from "../config";
import { CollectionType } from "../types";
import { productService } from "../services/productService";
import { formatINR } from "../utils/productDisplay";

interface FooterProps {
  onSelectCategory?: (category: string) => void;
  onNavigateCollection?: (collection: CollectionType) => void;
  onNavigateCollectionStyle?: (collection: CollectionType, style: string) => void;
}

// Styles offered by each collection, in display order
export const COLLECTION_STYLES: Record<CollectionType, string[]> = {
  alankritha: ["Straight Fit", "A-Line", "Anarkali"],
  ayanaa: ["Banarasi Silk", "Organza", "Katan Silk"],
};

/**
 * Site footer: a solid brand-coloured band with link columns (shop, styles, customer
 * service, delivery & payment), a strip with contact actions and payment/delivery
 * notes, then a centred copyright line. Every link goes to a real page, filter,
 * phone number, WhatsApp chat or email.
 */
export default function Footer({ onSelectCategory, onNavigateCollection, onNavigateCollectionStyle }: FooterProps) {
  const { collections } = BOUTIQUE_CONFIG;
  const whatsappUrl = `https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber}`;
  const phoneHref = `tel:${BOUTIQUE_CONFIG.supportPhone.replace(/\s+/g, "")}`;

  const handleCollectionClick = (col: CollectionType) => {
    if (onNavigateCollection) {
      onNavigateCollection(col);
    } else if (onSelectCategory) {
      onSelectCategory(col === "alankritha" ? "Kurtas" : "Sarees");
    }
  };

  const handleCategoryClick = (cat: string) => {
    if (onSelectCategory) {
      onSelectCategory(cat);
    }
  };

  // Only styles that currently have pieces on sale, so no link leads to an empty page
  const styleLinks = (Object.keys(COLLECTION_STYLES) as CollectionType[]).flatMap((col) =>
    COLLECTION_STYLES[col]
      .filter((style) => productService.getProducts({ collection: col, subcategory: style }).length > 0)
      .map((style) => ({ col, style, label: `${style} ${collections[col].category}` }))
  );

  const linkClass = "link-underline text-left text-white/80 hover:text-white transition-colors cursor-pointer";

  return (
    <footer className="text-canvas font-sans bg-maroon-800" id="anvaya-footer">
      <div className="container-page pt-12 sm:pt-14 pb-6">
        {/* Link columns */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 sm:gap-x-10"
          id="footer-columns-grid"
        >
          <FooterColumn title="Shop" id="footer-col-collections">
            {(Object.keys(collections) as CollectionType[]).map((col) => (
              <li key={col}>
                <button onClick={() => handleCollectionClick(col)} className={linkClass}>
                  {collections[col].name} ({collections[col].category})
                </button>
              </li>
            ))}
            {["New Arrivals", "Best Sellers", "Special Offers"].map((cat) => (
              <li key={cat}>
                <button onClick={() => handleCategoryClick(cat)} className={linkClass}>
                  {cat}
                </button>
              </li>
            ))}
          </FooterColumn>

          {onNavigateCollectionStyle && styleLinks.length > 0 && (
            <FooterColumn title="Shop by Style" id="footer-styles">
              {styleLinks.map(({ col, style, label }) => (
                <li key={`${col}-${style}`}>
                  <button onClick={() => onNavigateCollectionStyle(col, style)} className={linkClass}>
                    {label}
                  </button>
                </li>
              ))}
            </FooterColumn>
          )}

          <FooterColumn title="Customer Service" id="footer-col-support">
            <li id="support-phone">
              <a href={phoneHref} className={linkClass}>
                Call {BOUTIQUE_CONFIG.supportPhone}
              </a>
            </li>
            <li id="support-whatsapp">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                WhatsApp us
              </a>
            </li>
            <li id="support-email" className="min-w-0">
              <a href={`mailto:${BOUTIQUE_CONFIG.supportEmail}`} className={`${linkClass} break-all`}>
                {BOUTIQUE_CONFIG.supportEmail}
              </a>
            </li>
            <li id="support-hours" className="text-white/60">
              {BOUTIQUE_CONFIG.supportHours}
            </li>
          </FooterColumn>

          {/* The shop's actual checkout rules, as information rather than links */}
          <FooterColumn title="Delivery & Payment" id="footer-col-policies">
            <li className="text-white/80">
              Free shipping from {formatINR(BOUTIQUE_CONFIG.freeShippingThreshold)}
            </li>
            <li className="text-white/80">
              {formatINR(BOUTIQUE_CONFIG.standardShippingFee)} shipping below {formatINR(BOUTIQUE_CONFIG.freeShippingThreshold)}
            </li>
            <li className="text-white/80">Cash on Delivery</li>
            <li className="text-white/80">All India Delivery</li>
          </FooterColumn>
        </div>

        {/* Contact, payment and location strip */}
        <div
          className="mt-12 grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center"
          id="footer-bottom-strip"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-base text-white">Talk to us</span>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat on WhatsApp"
              title="Chat on WhatsApp"
              className="w-8 h-8 inline-flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
            </a>
            <a
              href={`mailto:${BOUTIQUE_CONFIG.supportEmail}`}
              aria-label="Email us"
              title="Email us"
              className="w-8 h-8 inline-flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <Mail className="w-4 h-4" />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 md:justify-center text-sm">
            <Banknote className="w-4 h-4 text-gold-300" aria-hidden="true" />
            <span className="text-white/90">Pay on delivery</span>
            {["Cash", "UPI"].map((method) => (
              <span key={method} className="px-2.5 py-1 bg-canvas text-maroon-800 text-2xs font-bold tracking-wider uppercase">
                {method}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 md:justify-end text-sm text-white/90">
            <MapPin className="w-4 h-4 text-gold-300" aria-hidden="true" />
            <span>Delivering across India</span>
          </div>
        </div>

        {/* Copyright */}
        <p className="mt-6 pt-5 border-t border-white/15 text-center text-xs sm:text-sm text-white/70" id="footer-bottom-bar">
          © {BOUTIQUE_CONFIG.establishedYear} {BOUTIQUE_CONFIG.brandName}. All rights reserved.{" "}
          <span className="text-white/35" aria-hidden="true">|</span> Featuring Alankritha &amp; Ayanaa collections
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <nav aria-label={title} id={id} className="min-w-0">
      <h2 className="text-sm sm:text-base font-semibold uppercase tracking-[0.08em] text-gold-300 mb-5">{title}</h2>
      <ul className="space-y-3.5 text-sm">{children}</ul>
    </nav>
  );
}
