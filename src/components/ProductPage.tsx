import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Banknote, Check, ChevronRight, MapPin, MessageSquare, Minus, Plus, Star, Truck } from "lucide-react";
import { CollectionType, Product } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { productService } from "../services/productService";
import { orderService } from "../services/orderService";
import { smoothScroll } from "../utils/smoothScroll";
import {
  formatINR,
  getCollectionKey,
  getDiscountPercent,
  getEffectivePrice,
  getGalleryImages,
  describeSize,
  getSizeOptions,
} from "../utils/productDisplay";
import ProductCard from "./ProductCard";
import ProductReviews from "./ProductReviews";
import RecentlyViewed from "./RecentlyViewed";
import ProductGallery from "./ProductGallery";
import MobileProductGallery from "./MobileProductGallery";
import { useIsMobile } from "../hooks/useIsMobile";
import ProductInfoSections from "./ProductInfoSections";
import NotFoundPage from "./NotFoundPage";
import SizePrompt, { focusFirstSize } from "./SizePrompt";
import { BackgroundMotif } from "./decor/Motifs";

interface ProductPageProps {
  productId: string;
  // Live, published storefront products (App state, kept in sync with productService)
  products: Product[];
  onAddToCart: (product: Product, size: string, quantity: number) => void;
  onBuyNow: (product: Product, size: string, quantity: number) => void;
  onOpenProduct: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onNavigateHome: () => void;
  onNavigateCollection: (collection: CollectionType) => void;
}

const LOW_STOCK_THRESHOLD = 3;

export default function ProductPage({
  productId,
  products,
  onAddToCart,
  onBuyNow,
  onOpenProduct,
  onQuickView,
  onNavigateHome,
  onNavigateCollection,
}: ProductPageProps) {
  const product = products.find((p) => p.id === productId) || null;

  // Page title follows the product; restored when leaving the page
  useEffect(() => {
    const previousTitle = document.title;
    document.title = product
      ? `${product.name} | ${BOUTIQUE_CONFIG.brandName}`
      : `Product not found | ${BOUTIQUE_CONFIG.brandName}`;
    return () => {
      document.title = previousTitle;
    };
  }, [product?.name]);

  if (!product) {
    return <ProductNotFound onNavigateHome={onNavigateHome} onNavigateCollection={onNavigateCollection} />;
  }

  // Keyed by product so size, quantity and gallery state reset when moving to a similar product
  return (
    <Fragment key={product.id}>
      <ProductDetails
        product={product}
        products={products}
        onAddToCart={onAddToCart}
        onBuyNow={onBuyNow}
        onOpenProduct={onOpenProduct}
        onQuickView={onQuickView}
        onNavigateHome={onNavigateHome}
        onNavigateCollection={onNavigateCollection}
      />
    </Fragment>
  );
}

function ProductDetails({
  product,
  products,
  onAddToCart,
  onBuyNow,
  onOpenProduct,
  onQuickView,
  onNavigateHome,
  onNavigateCollection,
}: Omit<ProductPageProps, "productId"> & { product: Product }) {
  const collectionKey = getCollectionKey(product);
  const collection = BOUTIQUE_CONFIG.collections[collectionKey];

  const images = useMemo(() => getGalleryImages(product), [product]);
  // Phones get a full-width swipe gallery; only one gallery is ever rendered
  const isMobile = useIsMobile();
  const codEnabled = BOUTIQUE_CONFIG.paymentMethods.some((m) => m.id === "cod" && m.enabled);
  const [quantity, setQuantity] = useState(1);
  const [addedSuccess, setAddedSuccess] = useState(false);

  const sizes = getSizeOptions(product);
  // One-size pieces (sarees) start with Free Size chosen when it is in stock
  const [selectedSize, setSelectedSize] = useState(() =>
    sizes.length === 1 && (product.sizeStock[sizes[0]] || 0) > 0 ? sizes[0] : ""
  );
  const totalStock = productService.getTotalStock(product);
  const isOutOfStock = totalStock === 0;
  const selectedStock = selectedSize ? product.sizeStock[selectedSize] || 0 : 0;
  const maxQuantity = Math.max(1, selectedStock);
  const discountPct = getDiscountPercent(product);

  const reviewCount = product.reviews?.length || 0;
  const avgRating = reviewCount
    ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
    : 0;

  // Recomputed every render so stock shown on similar cards is always current
  const similarProducts = productService.getSimilarProducts(product, 4);

  // A sale may leave the chosen size with less stock than the chosen quantity
  useEffect(() => {
    if (selectedSize && quantity > maxQuantity) setQuantity(maxQuantity);
  }, [selectedSize, quantity, maxQuantity]);

  useEffect(() => {
    if (!addedSuccess) return;
    const timer = setTimeout(() => setAddedSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [addedSuccess]);

  // Add to Cart / Order on WhatsApp pressed before choosing a size: say so under the sizes, bring
  // them into view and put focus on the first size that can be chosen
  const [sizePrompt, setSizePrompt] = useState(false);
  const sizeGroupRef = useRef<HTMLFieldSetElement>(null);
  const askForSize = () => {
    setSizePrompt(true);
    const group = sizeGroupRef.current;
    if (!group) return;
    const { top, bottom } = group.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) smoothScroll.scrollToElement(group);
    focusFirstSize(group);
  };

  const handleSizeChange = (size: string) => {
    setSelectedSize(size);
    setQuantity(1);
    setSizePrompt(false);
  };

  const handleAddToCart = () => {
    if (!selectedSize) return askForSize();
    if (selectedStock === 0) return;
    onAddToCart(product, selectedSize, quantity);
    setAddedSuccess(true);
  };

  const handleBuyNow = () => {
    if (!selectedSize) return askForSize();
    if (selectedStock === 0) return;
    onBuyNow(product, selectedSize, quantity);
  };

  const whatsappLink = orderService.generateWhatsAppProductEnquiryUrl(product.name, selectedSize || undefined);

  return (
    <div className="relative isolate overflow-hidden bg-canvas text-ink pb-24" id="product-page">
      <BackgroundMotif kind="sprig" className="left-0 bottom-16 md:bottom-24 w-20 h-52 md:w-32 md:h-80" />
      <BackgroundMotif kind="mandala" className="-right-16 md:-right-24 bottom-[28rem] md:bottom-40 w-40 h-40 md:w-64 md:h-64" />
      {/* Breadcrumb: Home → Collection → Product */}
      <nav aria-label="Breadcrumb" className="hidden md:block bg-surface border-b border-line py-3">
        <ol className="container-page breadcrumb">
          <li>
            <button onClick={onNavigateHome}>
              Home
            </button>
          </li>
          <li className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
            <button
              onClick={() => onNavigateCollection(collectionKey)}
             
            >
              {collection.name}
            </button>
          </li>
          <li className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate text-ink font-medium" aria-current="page">
              {product.name}
            </span>
          </li>
        </ol>
      </nav>

      {isMobile && (
        <MobileProductGallery
          images={images}
          productName={product.name}
          onBack={() => (window.history.length > 1 ? window.history.back() : onNavigateCollection(collectionKey))}
          onViewSimilar={() => smoothScroll.scrollToElement(document.getElementById("similar-products-heading"))}
        />
      )}

      <div className="container-page pt-4 md:pt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-14">
          {/* Gallery: thumbnails, desktop hover zoom and full-screen viewer */}
          {!isMobile && (
            <div className="lg:col-span-7">
              <ProductGallery images={images} productName={product.name} />
            </div>
          )}

          {/* Product information and purchase controls */}
          <section aria-label="Product details" className="lg:col-span-5 space-y-6">
            {/* Phone: bold title, MRP / price / % off, rating box, then a service row */}
            <div className="md:hidden">
              <h1 className="font-sans text-xl font-semibold leading-snug text-ink">{product.name}</h1>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {discountPct && (
                    <span className="text-sm text-muted">
                      MRP <span className="line-through">{formatINR(product.price)}</span>
                    </span>
                  )}
                  <span className="text-xl font-bold text-ink tabular-nums">{formatINR(getEffectivePrice(product))}</span>
                  {discountPct && <span className="text-sm font-bold text-maroon-600">{discountPct}% OFF</span>}
                </div>
                {reviewCount > 0 && (
                  <button
                    type="button"
                    onClick={() => smoothScroll.scrollToElement(document.getElementById("product-reviews"))}
                    aria-label={`Rated ${avgRating.toFixed(1)} out of 5 from ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`}
                    className="shrink-0 flex items-center gap-1 border border-line-strong rounded-xs px-2.5 py-1 text-base font-semibold cursor-pointer"
                  >
                    {avgRating.toFixed(1)}
                    <Star className="w-3.5 h-3.5 fill-success text-success" aria-hidden="true" />
                  </button>
                )}
              </div>
              <ul className={`mt-4 -mx-4 px-2 grid ${codEnabled ? "grid-cols-3" : "grid-cols-2"} border-y border-line bg-surface text-2xs font-semibold text-ink`}>
                <li className="flex items-center justify-center gap-1.5 py-3 text-center">
                  <Truck className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  <span>Free Shipping</span>
                </li>
                <li className={`flex items-center justify-center gap-1.5 py-3 text-center border-line ${codEnabled ? "border-x" : "border-l"}`}>
                  <MapPin className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  <span>Delivering across India</span>
                </li>
                {codEnabled && (
                  <li className="flex items-center justify-center gap-1.5 py-3 text-center">
                    <Banknote className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                    <span>
                      COD Available
                      <span className="block font-normal text-muted">cash or UPI</span>
                    </span>
                  </li>
                )}
              </ul>
            </div>

            {/* Wider screens: eyebrow, serif title, rating, price */}
            <div className="hidden md:block space-y-2">
              <span className="eyebrow">
                {collection.name} · {product.category}
                {product.subcategory ? ` · ${product.subcategory}` : ""}
              </span>
              <h1 className="heading-title">{product.name}</h1>

              {reviewCount > 0 && (
                <button
                  type="button"
                  onClick={() => smoothScroll.scrollToElement(document.getElementById("product-reviews"))}
                  className="inline-flex items-center gap-2 group cursor-pointer"
                >
                  <span className="flex items-center text-accent" aria-hidden="true">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${i < Math.round(avgRating) ? "fill-accent text-accent" : "text-line-strong"}`}
                      />
                    ))}
                  </span>
                  <span className="text-xs text-muted group-hover:text-ink transition-colors">
                    {avgRating.toFixed(1)} ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
                  </span>
                </button>
              )}

              <div className="flex items-baseline gap-2 pt-1">
                <span className="price text-xl">
                  {formatINR(getEffectivePrice(product))}
                </span>
                {discountPct && (
                  <>
                    <span className="price-was text-sm">{formatINR(product.price)}</span>
                    <span className="badge badge-success">
                      Save {discountPct}%
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Stock status */}
            <div aria-live="polite" id="product-stock-status">
              {isOutOfStock ? (
                <StockNote tone="danger">Sold out: this piece is currently unavailable.</StockNote>
              ) : selectedSize && selectedStock <= LOW_STOCK_THRESHOLD ? (
                <StockNote tone="warning">Only {selectedStock} left in {describeSize(selectedSize)}.</StockNote>
              ) : selectedSize ? (
                <StockNote tone="success">In stock in {describeSize(selectedSize)}: {selectedStock} available.</StockNote>
              ) : (
                <StockNote tone="success">In stock. Select a size to see availability.</StockNote>
              )}
            </div>

            {/* Size selection */}
            <fieldset
              ref={sizeGroupRef}
              className="space-y-2 scroll-mt-28"
              disabled={isOutOfStock}
              aria-describedby={sizePrompt && !selectedSize ? "size-prompt" : undefined}
            >
              <legend className={`field-label mb-2 ${sizePrompt && !selectedSize ? "!text-danger" : ""}`}>
                Select Size
              </legend>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => {
                  const count = product.sizeStock[size] || 0;
                  const sizeOut = count === 0;
                  return (
                    <button
                      key={size}
                      type="button"
                      disabled={sizeOut}
                      onClick={() => handleSizeChange(size)}
                      aria-pressed={selectedSize === size}
                      aria-label={`Size ${size}, ${sizeOut ? "sold out" : `${count} in stock`}`}
                      className="size-option"
                    >
                      <span>{size}</span>
                      <span className="text-2xs font-normal opacity-80">{sizeOut ? "sold out" : `${count} left`}</span>
                    </button>
                  );
                })}
              </div>
              {sizePrompt && !selectedSize && <SizePrompt id="size-prompt" />}
            </fieldset>

            {/* Quantity + Add to Cart */}
            {!isOutOfStock && (
              <div className="space-y-3">
                <div className="flex items-stretch gap-3">
                  <div className="flex items-center border border-line-strong rounded-xs bg-surface shrink-0" role="group" aria-label="Quantity">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={!selectedSize || quantity <= 1}
                      aria-label="Decrease quantity"
                      className="px-3 h-full text-muted hover:text-ink transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                      disabled={!selectedSize || quantity >= maxQuantity}
                      aria-label="Increase quantity"
                      className="px-3 h-full text-muted hover:text-ink transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className={`btn btn-lg flex-1 ${addedSuccess ? "btn-success" : "btn-primary"}`}
                  >
                    {addedSuccess ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Added to Cart
                      </span>
                    ) : selectedSize ? (
                      "Add to Cart"
                    ) : (
                      "Select a Size"
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleBuyNow}
                    className="btn btn-whatsapp"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Order on WhatsApp
                  </button>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    Ask a Question
                  </a>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="pt-6 border-t border-line">
              <h2 className="heading-label mb-3">Description</h2>
              <p className="text-body">{product.description}</p>
            </div>

            {/* Service badges, details / care / delivery / declaration, and help */}
            <ProductInfoSections product={product} />

            <button
              type="button"
              onClick={() => onNavigateCollection(collectionKey)}
              className="link text-xs font-medium"
            >
              ← Back to {collection.name}
            </button>
          </section>
        </div>

        {/* Similar products from the same collection */}
        <section aria-labelledby="similar-products-heading" className="mt-16 sm:mt-20 pt-10 border-t border-line">
          <div className="flex items-baseline justify-between gap-4 mb-6">
            <h2 id="similar-products-heading" className="heading-card">
              Similar {collectionKey === "alankritha" ? "Kurtas" : "Sarees"}
            </h2>
            <button
              type="button"
              onClick={() => onNavigateCollection(collectionKey)}
              className="link text-xs font-medium shrink-0"
            >
              View all in {collection.name} →
            </button>
          </div>

          {similarProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {similarProducts.map((p) => (
                <Fragment key={p.id}>
                  <ProductCard product={p} variant="collection" onOpen={onOpenProduct} onQuickView={onQuickView} />
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p className="heading-card mb-1">More {collection.name} pieces are on their way</p>
              <p className="text-sm text-muted">There are no other pieces in this collection yet.</p>
            </div>
          )}
        </section>

        {/* Pieces this shopper opened before (not the current one) */}
        <RecentlyViewed
          currentProductId={product.id}
          products={products}
          onOpenProduct={onOpenProduct}
          onQuickView={onQuickView}
        />

        {/* Write a Review, then Customer Reviews, at the end of the page */}
        <ProductReviews product={product}>
          <BackgroundMotif kind="paisley" className="right-2 md:right-auto md:left-[30%] top-4 md:top-16 w-14 h-24 md:w-24 md:h-40 -rotate-[25deg]" />
        </ProductReviews>
      </div>
    </div>
  );
}

function StockNote({ tone, children }: { tone: "success" | "warning" | "danger"; children: ReactNode }) {
  const styles = {
    success: "status-note-success",
    warning: "status-note-warning",
    danger: "status-note-danger",
  }[tone];
  const Icon = tone === "success" ? Check : AlertCircle;
  return (
    <div className={`status-note ${styles}`}>
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function ProductNotFound({
  onNavigateHome,
  onNavigateCollection,
}: Pick<ProductPageProps, "onNavigateHome" | "onNavigateCollection">) {
  return (
    <NotFoundPage
      id="product-not-found"
      eyebrow="Product not found"
      title="This piece isn't available"
      message="It may have been removed or the link may be incorrect. Explore our collections to find something you love."
      onNavigateHome={onNavigateHome}
      onNavigateCollection={onNavigateCollection}
    />
  );
}
