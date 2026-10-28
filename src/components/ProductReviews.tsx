import { useState, FormEvent } from "react";
import { Star, AlertCircle, Loader2 } from "lucide-react";
import { Product } from "../types";
import { productService } from "../services/productService";

interface ProductReviewsProps {
  product: Product;
  onNewReview: (updatedProduct: Product, brandReply: string) => void;
}

/**
 * Customer reviews list and submission form (in-memory, via productService).
 * Moved unchanged in behaviour from the original product-detail modal.
 */
export default function ProductReviews({ product, onNewReview }: ProductReviewsProps) {
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
    <div id="reviews-section-panel">
      {botReply && (
        <div className="mb-6 panel-muted p-4 text-sm text-ink-soft leading-relaxed animate-fade-in" id="assistant-brand-reply-bubble">
          <span className="eyebrow block mb-1">ALANKRITHA Boutique Director Reply:</span>
          "{botReply}"
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {/* Reviews List */}
        <div className="space-y-4" id="reviews-list">
          {!product.reviews || product.reviews.length === 0 ? (
            <p className="text-sm text-muted italic">No reviews yet. Be the first to share your feedback!</p>
          ) : (
            product.reviews.map((rev) => (
              <div key={rev.id} className="border-b border-line pb-4 text-sm" id={`review-item-${rev.id}`}>
                <div className="flex justify-between items-center">
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

        {/* Submit Feedback form */}
        <form onSubmit={handleReviewSubmit} className="panel space-y-4 p-5 self-start" id="feedback-form">
          <h4 className="heading-label">Submit Feedback on Purchase</h4>

          {reviewError && (
            <div className="field-error mt-0" role="alert">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{reviewError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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
      </div>
    </div>
  );
}
