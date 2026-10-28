import { useState, FormEvent, ReactNode } from "react";
import { Star, AlertCircle, Loader2 } from "lucide-react";
import { Product } from "../types";
import { productService } from "../services/productService";

interface ProductReviewsProps {
  product: Product;
  // Decoration placed inside the Customer Reviews section
  children?: ReactNode;
  onNewReview: (updatedProduct: Product, brandReply: string) => void;
}

/**
 * The end of the product page: a "Write a Review" section, then "Customer Reviews"
 * (in-memory, via productService). Submission behaviour is unchanged.
 */
export default function ProductReviews({ product, onNewReview, children }: ProductReviewsProps) {
  const [reviewAuthor, setReviewAuthor] = useState<string>("");
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string>("");
  const [botReply, setBotReply] = useState<string>("");

  const handleReviewSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reviewAuthor.trim() || !reviewComment.trim()) {
      setReviewError("Please fill out both your name and feedback comments.");
      return;
    }

    setSubmittingReview(true);
    setReviewError("");
    setBotReply("");

    try {
      const updatedProduct = productService.addReview(product.id, {
        author: reviewAuthor.trim(),
        rating: reviewRating,
        comment: reviewComment.trim(),
      });

      if (!updatedProduct) {
        throw new Error("Failed to submit feedback review");
      }

      const brandReply = updatedProduct.reviews[0]?.brandReply || "";
      onNewReview(updatedProduct, brandReply);
      setBotReply(brandReply);

      setReviewAuthor("");
      setReviewComment("");
      setReviewRating(5);
    } catch {
      setReviewError("Error publishing review. Please try again.");
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <>
      {/* Write a Review, directly above the customer reviews */}
      <section id="write-review" aria-labelledby="write-review-heading" className="relative isolate mt-16 sm:mt-20 pt-10 border-t border-line scroll-mt-28">
        <h2 id="write-review-heading" className="heading-card mb-2">
          Write a Review
        </h2>
        <p className="text-sm text-muted mb-6">Bought this piece? Share how the fabric, colour and fit felt.</p>

        {botReply && (
          <div className="mb-6 max-w-2xl panel-muted p-4 text-sm text-ink-soft leading-relaxed animate-fade-in" id="assistant-brand-reply-bubble" role="status">
            <span className="eyebrow block mb-1">ALANKRITHA Boutique Director Reply:</span>
            "{botReply}"
          </div>
        )}

        <form onSubmit={handleReviewSubmit} className="panel space-y-4 p-4 sm:p-6 max-w-2xl" id="feedback-form">
          {reviewError && (
            <div className="field-error mt-0" role="alert">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{reviewError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="review-author" className="field-label">Your Name</label>
              <input
                id="review-author"
                type="text"
                required
                placeholder="e.g. Shalini R."
                value={reviewAuthor}
                onChange={(e) => setReviewAuthor(e.target.value)}
                className="field"
              />
            </div>

            <div>
              <label htmlFor="review-rating" className="field-label">Boutique Rating</label>
              <select
                id="review-rating"
                value={reviewRating}
                onChange={(e) => setReviewRating(Number(e.target.value))}
                className="field"
              >
                <option value="5">⭐⭐⭐⭐⭐ (5/5)</option>
                <option value="4">⭐⭐⭐⭐ (4/5)</option>
                <option value="3">⭐⭐⭐ (3/5)</option>
                <option value="2">⭐⭐ (2/5)</option>
                <option value="1">⭐ (1/5)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="review-comment" className="field-label">Comments</label>
            <textarea
              id="review-comment"
              required
              rows={3}
              placeholder="Review the handcrafted fabrics, weaving, and fit elegance..."
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              className="field"
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={submittingReview}
            className="btn btn-primary btn-block"
          >
            {submittingReview ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Publishing review...</span>
              </>
            ) : (
              <span>Publish Review</span>
            )}
          </button>
        </form>
      </section>

      {/* Customer Reviews */}
      <section id="product-reviews" aria-labelledby="product-reviews-heading" className="relative isolate mt-12 sm:mt-16 pt-10 border-t border-line scroll-mt-28">
        {children}
        <h2 id="product-reviews-heading" className="heading-card mb-6">
          Customer Reviews
        </h2>
        <div className="space-y-4 max-w-3xl" id="reviews-list">
          {!product.reviews || product.reviews.length === 0 ? (
            <p className="text-sm text-muted italic">No reviews yet. Be the first to share your feedback!</p>
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

                {rev.brandReply && !botReply && (
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
