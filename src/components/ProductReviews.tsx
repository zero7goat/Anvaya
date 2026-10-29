import { ReactNode } from "react";
import { Star, MessageSquare } from "lucide-react";
import { Product } from "../types";
import { orderService } from "../services/orderService";

interface ProductReviewsProps {
  product: Product;
  // Decoration placed inside the Customer Reviews section
  children?: ReactNode;
}

/**
 * The end of the product page: how to share feedback, then "Customer Reviews" as
 * stored in the database (product_reviews). Shoppers have no accounts, and the database
 * lets only admins add reviews, so there is no public review form: feedback goes to the
 * boutique on WhatsApp, and the boutique can publish it from there.
 */
export default function ProductReviews({ product, children }: ProductReviewsProps) {
  const feedbackUrl = orderService.generateWhatsAppFeedbackUrl(product.name);

  return (
    <>
      {/* Share feedback, directly above the customer reviews */}
      <section id="write-review" aria-labelledby="write-review-heading" className="relative isolate mt-16 sm:mt-20 pt-10 border-t border-line scroll-mt-28">
        <h2 id="write-review-heading" className="heading-card mb-2">
          Share Your Feedback
        </h2>
        <p className="text-sm text-muted mb-6 max-w-2xl">
          Bought this piece? Tell us how the fabric, colour and fit felt. Online review submission isn't open yet, so
          please send your feedback on WhatsApp.
        </p>
        <a href={feedbackUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          <MessageSquare className="w-4 h-4" aria-hidden="true" />
          Send feedback on WhatsApp
        </a>
      </section>

      {/* Customer Reviews */}
      <section id="product-reviews" aria-labelledby="product-reviews-heading" className="relative isolate mt-12 sm:mt-16 pt-10 border-t border-line scroll-mt-28">
        {children}
        <h2 id="product-reviews-heading" className="heading-card mb-6">
          Customer Reviews
        </h2>
        <div className="space-y-4 max-w-3xl" id="reviews-list">
          {!product.reviews || product.reviews.length === 0 ? (
            <p className="text-sm text-muted italic">No reviews yet.</p>
          ) : (
            product.reviews.map((rev) => (
              <div key={rev.id} className="border-b border-line pb-4 text-sm break-words" id={`review-item-${rev.id}`}>
                <div className="flex flex-wrap justify-between items-baseline gap-x-3">
                  <span className="font-semibold text-ink">{rev.author}</span>
                  <span className="text-xs text-muted tabular-nums">{rev.date}</span>
                </div>

                <div className="flex items-center text-accent my-1.5" aria-label={`${rev.rating} out of 5 stars`}>
                  {[...Array(5)].map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-3 h-3 ${idx < rev.rating ? "fill-accent text-accent" : "text-line-strong"}`}
                    />
                  ))}
                </div>

                <p className="text-body">{rev.comment}</p>

                {rev.brandReply && (
                  <div className="mt-3 bg-surface-muted border-l-2 border-accent px-3 py-2 text-xs text-ink-soft italic">
                    <strong>Boutique response:</strong> {rev.brandReply}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
