import { CollectionType } from "../../types";
import { BOUTIQUE_CONFIG } from "../../config";
import { productService } from "../../services/productService";
import { SITE_IMAGES, getProductImage } from "../../data/imageRegistry";
import ProductImage from "../ProductImage";
import SectionHeader from "./SectionHeader";

// The styles each collection sells, in display order
const STYLES: { collection: CollectionType; style: string }[] = [
  { collection: "alankritha", style: "Straight Fit" },
  { collection: "alankritha", style: "A-Line" },
  { collection: "alankritha", style: "Anarkali" },
  { collection: "ayanaa", style: "Banarasi Silk" },
  { collection: "ayanaa", style: "Organza" },
  { collection: "ayanaa", style: "Katan Silk" },
];

/**
 * Six style cards (three kurta styles, three saree styles). Each opens its collection
 * page with that style selected. Images: a supplied style cover, else the first
 * product photo in that style, else the neutral placeholder. A style with no pieces
 * yet is shown as "coming soon" and is not clickable.
 */
export default function ShopByStyle({
  onNavigateCollectionStyle,
}: {
  onNavigateCollectionStyle: (collection: CollectionType, style: string) => void;
}) {
  const cards = STYLES.map(({ collection, style }) => {
    const pieces = productService.getProducts({ collection, subcategory: style });
    const withImage = pieces.find((p) => getProductImage(p));
    return {
      collection,
      style,
      count: pieces.length,
      image: SITE_IMAGES.styleCovers[style] || (withImage ? getProductImage(withImage) : ""),
    };
  });

  return (
    <section className="section-y border-t border-line" id="shop-by-style-section" aria-labelledby="shop-by-style-title">
      <div className="container-page">
        <SectionHeader eyebrow="Kurtas & sarees" title="Shop by Style" id="shop-by-style-title" />

        <ul className="flex lg:grid lg:grid-cols-6 gap-3 sm:gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cards.map(({ collection, style, count, image }) => {
            const collectionInfo = BOUTIQUE_CONFIG.collections[collection];
            const available = count > 0;
            const content = (
              <>
                <div className="relative aspect-[3/4] overflow-hidden bg-surface-muted">
                  <ProductImage src={image} alt={`${style} ${collectionInfo.category}`} className="w-full h-full object-cover object-top" loading="lazy" />
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-800 scale-x-0 origin-left transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
                </div>
                <div className="pt-3">
                  <span className="block font-serif text-base sm:text-lg text-ink group-hover:text-maroon-600 transition-colors">
                    {style}
                  </span>
                  <span className="block text-2xs uppercase tracking-[0.14em] text-muted mt-0.5">
                    {collectionInfo.name} · {available ? `${count} ${count === 1 ? "piece" : "pieces"}` : "Coming soon"}
                  </span>
                </div>
              </>
            );
            return (
              <li key={style} className="snap-start shrink-0 w-[42%] sm:w-[28%] lg:w-auto">
                {available ? (
                  <button
                    onClick={() => onNavigateCollectionStyle(collection, style)}
                    className="group block w-full text-left cursor-pointer"
                    aria-label={`Shop ${style} ${collectionInfo.category.toLowerCase()}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="opacity-70" aria-label={`${style} ${collectionInfo.category.toLowerCase()}: coming soon`}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
