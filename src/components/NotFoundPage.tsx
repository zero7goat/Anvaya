import { useEffect } from "react";
import { CollectionType, Product } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";
import { getProductImage } from "../data/imageRegistry";
import { formatINR, getEffectivePrice, getProductPath, isPlainLeftClick } from "../utils/productDisplay";
import ProductImage from "./ProductImage";
import Reveal, { staggerDelay } from "./Reveal";

interface NotFoundPageProps {
  id: string;
  eyebrow: string;
  title: string;
  message: string;
  // Browser tab title while shown; leave out when the page sets its own
  documentTitle?: string;
  onNavigateHome: () => void;
  onNavigateCollection: (collection: CollectionType) => void;
  // Opens one of the suggested pieces
  onOpenProduct?: (product: Product) => void;
}

/**
 * "Not found" message with ways back into the shop. Used for unknown addresses and for
 * product links that no longer match a piece. Search engines are asked not to index it.
 */
export default function NotFoundPage({
  id,
  eyebrow,
  title,
  message,
  documentTitle,
  onNavigateHome,
  onNavigateCollection,
  onOpenProduct,
}: NotFoundPageProps) {
  // A few of the newest pieces in stock, so the visitor has somewhere to go
  const suggestions = onOpenProduct
    ? productService
        .getProducts({ sortBy: "newest" })
        .filter((p) => productService.getTotalStock(p) > 0)
        .slice(0, 4)
    : [];
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    const previousTitle = document.title;
    if (documentTitle) document.title = documentTitle;
    return () => {
      robots.remove();
      if (documentTitle) document.title = previousTitle;
    };
  }, [documentTitle]);

  return (
    <div className="bg-canvas min-h-[60vh] flex flex-col items-center justify-center px-4 py-24" id={id}>
      <Reveal className="max-w-md text-center">
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="heading-title mb-3">{title}</h1>
        <p className="text-body mb-8">{message}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => onNavigateCollection("alankritha")} className="btn btn-primary">
            {BOUTIQUE_CONFIG.collections.alankritha.name} Kurtas
          </button>
          <button onClick={() => onNavigateCollection("ayanaa")} className="btn btn-primary">
            {BOUTIQUE_CONFIG.collections.ayanaa.name} Sarees
          </button>
          <button onClick={onNavigateHome} className="btn btn-secondary">
            Home
          </button>
        </div>
      </Reveal>

      {suggestions.length > 0 && (
        <section aria-labelledby={`${id}-suggestions`} className="mt-16 w-full max-w-4xl">
          <h2 id={`${id}-suggestions`} className="eyebrow text-ink text-center mb-5">
            You may like
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {suggestions.map((product, i) => (
              <li key={product.id}>
                <Reveal delay={staggerDelay(i)}>
                  <a
                    href={getProductPath(product.id)}
                    onClick={(e) => {
                      if (!isPlainLeftClick(e)) return;
                      e.preventDefault();
                      onOpenProduct?.(product);
                    }}
                    className="group block"
                  >
                    <div className="aspect-[3/4] overflow-hidden bg-surface-muted">
                      <ProductImage src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" sizes="220px" />
                    </div>
                    <p className="mt-2 text-sm text-ink line-clamp-2 group-hover:text-maroon-600 transition-colors">{product.name}</p>
                    <p className="price text-sm">{formatINR(getEffectivePrice(product))}</p>
                  </a>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
