import { MessageSquare } from "lucide-react";
import { CollectionType } from "../../types";
import { BOUTIQUE_CONFIG } from "../../config";

/**
 * Short brand introduction built only from the existing brand configuration: the
 * Anvaya name and tagline, its two collections, and where it ships from. No
 * history, mission or craft claims beyond what the business has stated.
 */
export default function BrandStory({
  onNavigateCollection,
}: {
  onNavigateCollection: (collection: CollectionType) => void;
}) {
  const { collections } = BOUTIQUE_CONFIG;

  return (
    <section className="bg-maroon-900 text-canvas" id="brand-story-section" aria-labelledby="brand-story-title">
      <div className="container-page py-16 sm:py-20 text-center max-w-3xl">
        <img src="/images/Logo.png" alt="" className="h-14 sm:h-16 w-auto mx-auto object-contain" decoding="async" />
        <h2 id="brand-story-title" className="mt-5 font-serif text-2xl sm:text-3xl tracking-[0.22em] uppercase text-canvas">
          {BOUTIQUE_CONFIG.brandName}
        </h2>
        <p className="mt-2 eyebrow text-gold-300">{BOUTIQUE_CONFIG.brandTagline}</p>
        <p className="mt-6 font-serif italic text-lg sm:text-xl text-white/85 leading-relaxed">
          {BOUTIQUE_CONFIG.brandSubtitle}.
        </p>
        <p className="mt-4 text-sm text-white/65 leading-relaxed">
          Two collections under one name: {collections.alankritha.name}, {collections.alankritha.tagline.toLowerCase()},
          and {collections.ayanaa.name}, {collections.ayanaa.tagline.toLowerCase()}. Delivered across India.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {(Object.keys(collections) as CollectionType[]).map((col) => (
            <button
              key={col}
              onClick={() => onNavigateCollection(col)}
              className="btn btn-sm border border-white/30 text-canvas hover:bg-white hover:text-maroon-900 hover:border-white"
            >
              Explore {collections[col].name}
            </button>
          ))}
          <a
            href={`https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-whatsapp"
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            Ask on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
