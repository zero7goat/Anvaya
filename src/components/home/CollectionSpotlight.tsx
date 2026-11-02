import { ArrowRight } from "lucide-react";
import { CollectionType, Product } from "../../types";
import { BOUTIQUE_CONFIG } from "../../config";
import { productService } from "../../services/productService";
import { SITE_IMAGES, getProductImage } from "../../data/imageRegistry";
import ProductCard from "../ProductCard";
import ProductImage from "../ProductImage";

// When no campaign image is supplied, use this catalogue product's own photo (or, if it
// isn't in the shop, the newest piece that has a photo)
const FALLBACK_PRODUCT: Partial<Record<CollectionType, string>> = {
  ayanaa: "alk-017",
};

/**
 * Editorial "moment" for one collection: a large image beside the collection's
 * name, description, styles and two of its pieces. `reverse` mirrors the layout so
 * consecutive spotlights alternate.
 */
export default function CollectionSpotlight({
  collectionKey,
  reverse = false,
  onNavigateCollection,
  onProductClick,
  onQuickView,
}: {
  collectionKey: CollectionType;
  reverse?: boolean;
  onNavigateCollection: (collection: CollectionType) => void;
  onProductClick: (product: Product) => void;
  onQuickView: (product: Product) => void;
}) {
  const info = BOUTIQUE_CONFIG.collections[collectionKey];
  const pieces = productService.getProducts({ collection: collectionKey, sortBy: "newest" });
  const styles = [...new Set(pieces.map((p) => p.subcategory).filter(Boolean))];

  const chosen = FALLBACK_PRODUCT[collectionKey] ? productService.getProductById(FALLBACK_PRODUCT[collectionKey]!) : null;
  const fallback =
    (chosen && chosen.status === "enabled" ? chosen : null) ?? pieces.find((p) => getProductImage(p) !== "") ?? null;
  const image = SITE_IMAGES.editorial[collectionKey] || (fallback ? getProductImage(fallback) : "");
  const imageProduct = !SITE_IMAGES.editorial[collectionKey] && fallback ? fallback : null;
  const showcase = pieces.filter((p) => p.id !== imageProduct?.id).slice(0, 2);

  return (
    <section
      className="section-y border-t border-line"
      id={`spotlight-${collectionKey}`}
      aria-labelledby={`spotlight-${collectionKey}-title`}
    >
      <div className="container-page grid lg:grid-cols-12 gap-8 lg:gap-14 items-center">
        {/* Large image */}
        <div className={`lg:col-span-6 ${reverse ? "lg:order-last" : ""}`}>
          <div className="relative aspect-[3/4] overflow-hidden bg-surface-muted">
            {image ? (
              <>
                <ProductImage
                  src={image}
                  alt={imageProduct ? imageProduct.name : `${info.name} campaign`}
                  className="w-full h-full object-cover object-top"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                />
                {imageProduct && (
                  <button
                    onClick={() => onProductClick(imageProduct)}
                    className="absolute left-3 bottom-3 sm:left-4 sm:bottom-4 badge badge-overlay px-3 py-1.5 hover:bg-white transition-colors cursor-pointer"
                  >
                    Shown: {imageProduct.name}
                  </button>
                )}
              </>
            ) : (
              <CampaignPlaceholder label={`${info.name} campaign imagery`} />
            )}
          </div>
        </div>

        {/* Copy + pieces */}
        <div className="lg:col-span-6">
          <p className="eyebrow mb-3">Collection spotlight</p>
          <h2 id={`spotlight-${collectionKey}-title`} className="heading-display">
            {info.name}
          </h2>
          <p className="eyebrow tracking-[0.28em] mt-2">{info.byline}</p>
          <p className="mt-5 font-serif italic text-lg text-ink">{info.tagline}</p>
          <p className="text-body mt-2 max-w-md">{info.description}</p>

          {styles.length > 0 && (
            <p className="mt-4 text-xs text-muted">
              <span className="font-semibold text-ink tabular-nums">{pieces.length}</span>{" "}
              {pieces.length === 1 ? "piece" : "pieces"} · {styles.join(" · ")}
            </p>
          )}

          <button onClick={() => onNavigateCollection(collectionKey)} className="btn btn-primary mt-6 group">
            Shop {info.name}
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>

          {showcase.length > 0 && (
            <ul className="mt-9 grid grid-cols-2 gap-3 sm:gap-4 max-w-md">
              {showcase.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} variant="listing" onOpen={onProductClick} onQuickView={onQuickView} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Clearly identified slot for campaign photography that has not been supplied yet
 * (set it in SITE_IMAGES.editorial). Never filled with an unrelated image.
 */
function CampaignPlaceholder({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={`${label} coming soon`}
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-maroon-900 text-gold-300 text-center px-6"
      data-asset-slot={label}
    >
      <img src="/images/logo-144.png" width={159} height={144} alt="" className="h-14 w-auto object-contain opacity-80" decoding="async" />
      <span className="text-2xs font-semibold uppercase tracking-[0.22em]">{label} coming soon</span>
    </div>
  );
}
