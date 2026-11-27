import { BadgeCheck, Star } from "lucide-react";
import { Product } from "../../types";
import { productService } from "../../services/productService";
import { getProductImage } from "../../data/imageRegistry";
import ProductImage from "../ProductImage";
import SectionHeader from "./SectionHeader";
import { BackgroundMotif } from "../decor/Motifs";

/**
 * Reviews already left on catalogue products, shown as written (author, rating,
 * date, verified flag) with a link to the reviewed piece. Renders nothing when
 * there are no reviews; nothing is invented to fill the space.
 */
export default function CustomerReviews({ onProductClick }: { onProductClick: (product: Product) => void }) {
  const reviews = productService
    .getProducts({})
    .flatMap((product) => (product.reviews || []).map((review) => ({ review, product })))
    .sort((a, b) => b.review.date.localeCompare(a.review.date))
    .slice(0, 3);

  if (reviews.length === 0) return null;

  return (
    <section className="relative isolate overflow-hidden section-y border-t border-line" id="customer-reviews-section" aria-labelledby="customer-reviews-title">
      <BackgroundMotif kind="mandala" className="-right-16 md:-right-24 -top-6 md:-top-10 w-40 h-40 md:w-72 md:h-72" />
      <div className="relative container-page">
        <SectionHeader eyebrow="In their words" title="Customer Reviews" id="customer-reviews-title" />

        <ul className={`grid gap-4 sm:gap-6 ${reviews.length > 1 ? "md:grid-cols-2" : ""} ${reviews.length > 2 ? "lg:grid-cols-3" : ""}`}>
          {reviews.map(({ review, product }) => (
            <li key={review.id} className="panel p-5 sm:p-6 flex flex-col">
              <div className="flex items-center gap-0.5" aria-label={`Rated ${review.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${i < review.rating ? "fill-gold-500 text-gold-500" : "text-line-strong"}`}
                    aria-hidden="true"
                  />
                ))}
              </div>

              <blockquote className="mt-4 font-serif text-lg leading-relaxed text-ink flex-1">“{review.comment}”</blockquote>

              <p className="mt-4 text-xs text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-ink">{review.author}</span>
                {review.verified && (
                  <span className="inline-flex items-center gap-1 text-success">
                    <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    Verified buyer
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <time dateTime={review.date}>
                  {new Date(review.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </time>
              </p>

              {/* The reviewed piece */}
              <button
                onClick={() => onProductClick(product)}
                className="mt-5 pt-4 border-t border-line flex items-center gap-3 text-left group cursor-pointer"
              >
                <span className="w-9 h-12 shrink-0 overflow-hidden bg-surface-muted">
                  <ProductImage src={getProductImage(product)} alt="" className="w-full h-full object-cover" compact loading="lazy" />
                </span>
                <span className="min-w-0 text-xs">
                  <span className="block text-muted">Reviewed</span>
                  <span className="block text-ink truncate group-hover:text-maroon-600 transition-colors">{product.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
