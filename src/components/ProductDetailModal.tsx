import { useState, FormEvent, useMemo } from "react";
import { X, Star, Check, AlertCircle, Loader2, MessageSquare } from "lucide-react";
import { Product, Review } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, size: string, quantity: number) => void;
  onBuyNow: (product: Product, size: string, quantity: number) => void; // Directly trigger checkout
  onNewReview: (updatedProduct: Product, brandReply: string) => void;
}

export default function ProductDetailModal({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
  onNewReview,
}: ProductDetailModalProps) {
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);

  // Review Form state
  const [reviewAuthor, setReviewAuthor] = useState<string>("");
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string>("");

  // Simulated live assistant response bubble
  const [botReply, setBotReply] = useState<string>("");

  // Calculate product-wide total stock
  const totalStock = useMemo(() => {
    if (!product.sizeStock) return 0;
    return Object.values(product.sizeStock).reduce((acc, count) => acc + count, 0);
  }, [product.sizeStock]);

  const isOutOfStock = totalStock === 0;

  // Calculate average rating
  const avgRating = useMemo(() => {
    if (!product.reviews || product.reviews.length === 0) return 5;
    return product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length;
  }, [product.reviews]);

  // Available size list from product sizeStock
  const sizesList = useMemo(() => {
    if (!product.sizeStock) return [];
    return Object.keys(product.sizeStock);
  }, [product.sizeStock]);

  // Maximum allowed quantity for currently selected size
  const maxAllowedQuantity = useMemo(() => {
    if (!selectedSize || !product.sizeStock) return 1;
    return product.sizeStock[selectedSize] || 1;
  }, [selectedSize, product.sizeStock]);

  // Adjust quantity if it exceeds max allowed for newly selected size
  const handleSizeChange = (size: string) => {
    setSelectedSize(size);
    setQuantity(1); // Reset to 1
  };

  const handleAddToCartSubmit = () => {
    if (!selectedSize) return;
    onAddToCart(product, selectedSize, quantity);
    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
    }, 2000);
  };

  const handleBuyNowSubmit = () => {
    if (!selectedSize) return;
    onBuyNow(product, selectedSize, quantity);
  };

  const handleReviewSubmit = async (e: FormEvent) => {
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
      // Inform parent controller of newly updated reviews & brand reply
      onNewReview(updatedProduct, brandReply);
      setBotReply(brandReply);

      // Reset form fields
      setReviewAuthor("");
      setReviewComment("");
      setReviewRating(5);
    } catch (err: any) {
      setReviewError("Error publishing review. Please try again.");
    } finally {
      setSubmittingReview(false);
    }
  };

  // Generate customized WhatsApp Link for this exact outfit
  const whatsappLink = useMemo(() => {
    const text = `Namaste ALANKRITHA! I am interested in inquiring about the "${product.name}"${
      selectedSize ? ` in Size "${selectedSize}"` : ""
    }. Could you please share more details or photos? Thank you!`;
    const cleanPhone = BOUTIQUE_CONFIG.whatsappNumber.replace(/\D/g, "");
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }, [product.name, selectedSize]);

  const hasDiscount = product.salePrice && product.salePrice < product.price;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in" id="product-detail-modal-root">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-brand-charcoal/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        id="detail-modal-backdrop"
      ></div>

      {/* Modal Viewbox */}
      <div className="flex min-h-screen items-center justify-center p-4 sm:p-6" id="detail-modal-container">
        <div className="relative w-full max-w-4xl bg-brand-cream rounded-none shadow-lg overflow-hidden border border-brand-border" id="detail-modal-card">
          
          {/* Close Trigger */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 p-2 rounded-full bg-brand-cream/80 hover:bg-brand-beige text-brand-charcoal border border-brand-border/40 transition-colors cursor-pointer"
            id="close-modal-btn"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 max-h-[90vh] overflow-y-auto" id="detail-modal-grid">
            
            {/* Column 1: Editorial Outfit Imagery & Integrity Badge */}
            <div className="p-6 sm:p-8 bg-brand-beige/20 border-r border-brand-border/30 flex flex-col justify-between" id="detail-modal-col-img">
              <div className="aspect-[3/4] overflow-hidden rounded-none bg-transparent">
                <img
                  src={product.image}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  id="detail-modal-img"
                />
              </div>

              {/* Verified Stock status indicator */}
              <div className="mt-5" id="detail-stock-status">
                {isOutOfStock ? (
                  <div className="flex items-center space-x-2 text-rose-700 bg-rose-50 px-3 py-2.5 rounded border border-rose-100 text-[11px]">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Sold Out: This artisanal outfit is currently sold out.</span>
                  </div>
                ) : selectedSize && (product.sizeStock[selectedSize] || 0) === 0 ? (
                  <div className="flex items-center space-x-2 text-rose-700 bg-rose-50 px-3 py-2.5 rounded border border-rose-100 text-[11px]">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Size Out of Stock: Select another size to order.</span>
                  </div>
                ) : selectedSize && (product.sizeStock[selectedSize] || 0) <= 3 ? (
                  <div className="flex items-center space-x-2 text-amber-700 bg-amber-50 px-3 py-2.5 rounded border border-amber-100 text-[11px] animate-pulse">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Boutique Alert: Only {product.sizeStock[selectedSize]} left in Size {selectedSize}!</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-emerald-800 bg-emerald-50 px-3 py-2.5 rounded border border-emerald-100 text-[11px]">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Real-time boutique stock connected. Ready to pack and dispatch.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Specs, Purchase Action Center, & Sentiment reviews */}
            <div className="p-6 sm:p-8 flex flex-col justify-between space-y-6" id="detail-modal-col-info">
              
              {/* Product Header details */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-accent">
                  {product.category} {product.subcategory ? `• ${product.subcategory}` : ""}
                </span>
                <h2 className="text-xl sm:text-2xl font-serif text-brand-charcoal leading-tight">
                  {product.name}
                </h2>

                {/* Rating feedback overview */}
                <div className="flex items-center space-x-2">
                  <div className="flex items-center text-brand-accent">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${
                          i < Math.round(avgRating)
                            ? "fill-brand-accent text-brand-accent"
                            : "text-brand-border"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-brand-muted font-light">
                    {avgRating.toFixed(1)} ({product.reviews ? product.reviews.length : 0} reviews)
                  </span>
                </div>

                {/* Indian Rupees Price tag */}
                <div className="flex items-baseline space-x-2 pt-1 font-sans">
                  {hasDiscount ? (
                    <>
                      <span className="text-lg font-bold text-brand-accent">
                        ₹{product.salePrice!.toLocaleString("en-IN")}
                      </span>
                      <span className="text-sm text-brand-muted line-through">
                        ₹{product.price.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold font-sans">
                        Save {Math.round(((product.price - product.salePrice!) / product.price) * 100)}%
                      </span>
                    </>
                  ) : (
                    <span className="text-base font-semibold text-brand-charcoal">
                      ₹{product.price.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
              </div>

              {/* Product Sizing, fabrics care & Specs */}
              <div className="text-xs text-brand-muted leading-relaxed font-light space-y-2">
                <p>{product.description}</p>
                <div className="bg-brand-beige/30 p-2.5 rounded border border-brand-border/40 text-[10px] space-y-1">
                  <p><strong>Fabric:</strong> Handspun organic linen-silk blend & traditional dyes</p>
                  <p><strong>Care:</strong> Dry clean recommended. Gentle handwash in cold water.</p>
                </div>
              </div>

              {/* Purchase controls */}
              {!isOutOfStock && (
                <div className="space-y-4 pt-3 border-t border-brand-border/40" id="purchase-controls">
                  
                  {/* Size Selectors showing variant stock levels */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[11px] font-bold uppercase text-brand-charcoal">
                      <span>Select Size Variant:</span>
                      {selectedSize && (
                        <span className="text-brand-accent font-sans">
                          Stock: {product.sizeStock[selectedSize] || "0"} items left
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {sizesList.map((size) => {
                        const sizeStockCount = product.sizeStock[size] || 0;
                        const sizeOut = sizeStockCount === 0;

                        return (
                          <button
                            key={size}
                            disabled={sizeOut}
                            onClick={() => handleSizeChange(size)}
                            className={`px-3 py-2 rounded-md text-[11px] font-bold flex flex-col items-center justify-center border transition-all cursor-pointer min-w-[50px] ${
                              sizeOut
                                ? "bg-zinc-100 text-zinc-300 border-zinc-200 cursor-not-allowed line-through"
                                : selectedSize === size
                                ? "bg-brand-charcoal text-brand-cream border-brand-charcoal shadow-xs"
                                : "bg-brand-cream text-brand-charcoal border-brand-border hover:bg-brand-beige"
                            }`}
                          >
                            <span>{size}</span>
                            <span className="text-[8px] font-light opacity-80">
                              {sizeOut ? "out" : `(${sizeStockCount})`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quantity and Checkout Operations */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center space-x-3">
                      {/* Quantity Toggler */}
                      <div className="flex items-center border border-brand-border rounded px-2.5 py-1 bg-brand-cream shrink-0">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          disabled={quantity <= 1 || !selectedSize}
                          className="p-1 text-brand-muted hover:text-brand-charcoal disabled:opacity-30 cursor-pointer font-bold text-xs"
                        >
                          -
                        </button>
                        <span className="px-3 py-0.5 text-xs font-semibold text-brand-charcoal select-none">
                          {quantity}
                        </span>
                        <button
                          onClick={() => setQuantity(Math.min(maxAllowedQuantity, quantity + 1))}
                          disabled={quantity >= maxAllowedQuantity || !selectedSize}
                          className="p-1 text-brand-muted hover:text-brand-charcoal disabled:opacity-30 cursor-pointer font-bold text-xs"
                        >
                          +
                        </button>
                      </div>

                      {/* Add to Cart button */}
                      <button
                        onClick={handleAddToCartSubmit}
                        disabled={!selectedSize}
                        className={`flex-1 py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                          selectedSize
                            ? addedSuccess
                              ? "bg-emerald-800 text-white"
                              : "bg-brand-charcoal text-brand-cream hover:bg-brand-charcoal/90"
                            : "bg-brand-beige text-brand-muted border border-brand-border cursor-not-allowed"
                        }`}
                      >
                        {addedSuccess ? (
                          <span className="flex items-center justify-center space-x-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Added to Wardrobe</span>
                          </span>
                        ) : selectedSize ? (
                          "Add to Cart"
                        ) : (
                          "Select Size Variant"
                        )}
                      </button>
                    </div>

                    {/* Secondary instant checkout and whatsapp contact actions */}
                    {selectedSize && (
                      <div className="grid grid-cols-2 gap-2 pt-1 animate-fade-in">
                        <button
                          onClick={handleBuyNowSubmit}
                          className="w-full py-2.5 bg-brand-accent text-brand-cream hover:bg-brand-accent/90 rounded text-xs font-semibold uppercase tracking-wider cursor-pointer"
                        >
                          Buy Now (Checkout)
                        </button>
                        
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-2.5 border border-brand-accent/40 hover:bg-brand-beige text-brand-charcoal rounded text-xs font-semibold uppercase tracking-wider cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-brand-accent" />
                          <span>WhatsApp Chat</span>
                        </a>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Reviews Display and Submission Form */}
              <div className="border-t border-brand-border/40 pt-6" id="reviews-section-panel">
                <h3 className="text-sm font-bold uppercase tracking-wider text-brand-charcoal mb-4">Customer Reviews</h3>
                
                {/* AI Manager Responder Response bubble */}
                {botReply && (
                  <div className="mb-4 bg-brand-beige/80 border border-brand-accent/30 rounded p-3 text-[11px] text-brand-charcoal font-light leading-relaxed animate-fade-in" id="assistant-brand-reply-bubble">
                    <span className="font-semibold text-brand-accent block mb-0.5">ALANKRITHA Boutique Director Reply:</span>
                    "{botReply}"
                  </div>
                )}

                {/* Reviews List */}
                <div className="space-y-4 max-h-[180px] overflow-y-auto pr-1 mb-5" id="reviews-list">
                  {!product.reviews || product.reviews.length === 0 ? (
                    <p className="text-[11px] text-brand-muted italic">No reviews yet. Be the first to share your feedback!</p>
                  ) : (
                    product.reviews.map((rev) => (
                      <div key={rev.id} className="border-b border-brand-border/40 pb-3 text-xs" id={`review-item-${rev.id}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-brand-charcoal">{rev.author}</span>
                          <span className="text-[10px] text-brand-muted">{rev.date}</span>
                        </div>
                        
                        <div className="flex items-center text-brand-accent my-1">
                          {[...Array(5)].map((_, idx) => (
                            <Star
                              key={idx}
                              className={`w-3 h-3 ${
                                idx < rev.rating
                                  ? "fill-brand-accent text-brand-accent"
                                  : "text-brand-border"
                              }`}
                            />
                          ))}
                        </div>
                        
                        <p className="text-brand-muted font-light leading-relaxed">
                          {rev.comment}
                        </p>

                        {rev.brandReply && !botReply && (
                          <div className="mt-2 bg-brand-beige/50 border-l-2 border-brand-accent p-2 text-[10px] text-brand-charcoal italic">
                            <strong>Boutique response:</strong> {rev.brandReply}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Submit Feedback form */}
                <form onSubmit={handleReviewSubmit} className="space-y-3 bg-brand-beige/20 p-4 rounded border border-brand-border/40" id="feedback-form">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-charcoal">Submit Feedback on Purchase</h4>
                  
                  {reviewError && (
                    <div className="text-[10px] text-rose-700 font-semibold flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{reviewError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {/* Name */}
                    <div>
                      <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Your Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Shalini R."
                        value={reviewAuthor}
                        onChange={(e) => setReviewAuthor(e.target.value)}
                        className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:outline-none focus:ring-1 focus:ring-brand-accent"
                      />
                    </div>

                    {/* Rating select */}
                    <div>
                      <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Boutique Rating</label>
                      <select
                        value={reviewRating}
                        onChange={(e) => setReviewRating(Number(e.target.value))}
                        className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:outline-none focus:ring-1 focus:ring-brand-accent cursor-pointer font-sans"
                      >
                        <option value="5">⭐⭐⭐⭐⭐ (5/5)</option>
                        <option value="4">⭐⭐⭐⭐ (4/5)</option>
                        <option value="3">⭐⭐⭐ (3/5)</option>
                        <option value="2">⭐⭐ (2/5)</option>
                        <option value="1">⭐ (1/5)</option>
                      </select>
                    </div>
                  </div>

                  {/* Comment */}
                  <div>
                    <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Comments</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Review the handcrafted fabrics, weaving, and fit elegance..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="w-full py-2 bg-brand-charcoal text-brand-cream hover:bg-brand-accent rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    {submittingReview ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Publishing review on server...</span>
                      </>
                    ) : (
                      <span>Publish Review</span>
                    )}
                  </button>
                </form>
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
