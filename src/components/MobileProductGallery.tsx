import { useRef, useState } from "react";
import { ChevronLeft, Layers, Share2 } from "lucide-react";
import { ImagePlaceholder } from "./ProductImage";
import { ImageViewer } from "./ProductGallery";
import { IMAGE_WIDTHS, responsiveImage } from "../utils/imageSources";

/**
 * Phone product gallery: full-width photos that swipe sideways (native scroll-snap),
 * with a back button, "View Similar", share and dash indicators over the photo.
 * Tapping a photo opens the full-screen viewer.
 */
export default function MobileProductGallery({
  images,
  productName,
  onBack,
  onViewSimilar,
}: {
  images: string[];
  productName: string;
  onBack: () => void;
  onViewSimilar: () => void;
}) {
  const [active, setActive] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const trackRef = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goTo = (idx: number) => {
    const el = trackRef.current;
    el?.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  // Native share sheet where available, otherwise copy the page link
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: productName, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
    } catch {
      // Share sheet dismissed, or clipboard unavailable
      return;
    }
    setTimeout(() => setShareNote(""), 2000);
  };

  const overlayButton =
    "flex items-center justify-center w-9 h-9 rounded-full bg-white/85 text-ink shadow-sm backdrop-blur-sm cursor-pointer";

  return (
    <section aria-label="Product images" className="relative w-full bg-surface-muted" id="mobile-product-gallery">
      {images.length === 0 ? (
        <ImagePlaceholder className="aspect-[3/4] w-full" label={productName} />
      ) : (
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex w-full aspect-[3/4] overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, idx) => {
            const sources = responsiveImage(src, IMAGE_WIDTHS.product);
            return (
              <button
                key={src}
                type="button"
                onClick={() => setViewerOpen(true)}
                aria-label={`Open full-screen view, image ${idx + 1} of ${images.length}`}
                className="relative shrink-0 w-full h-full snap-center cursor-zoom-in"
              >
                <img
                  src={sources.src}
                  srcSet={sources.srcSet}
                  sizes={sources.srcSet ? "100vw" : undefined}
                  alt={images.length > 1 ? `${productName}, image ${idx + 1} of ${images.length}` : productName}
                  referrerPolicy="no-referrer"
                  loading={idx === 0 ? "eager" : "lazy"}
                  fetchPriority={idx === 0 ? "high" : "auto"}
                  decoding="async"
                  draggable={false}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Back */}
      <button type="button" onClick={onBack} aria-label="Go back" className={`${overlayButton} absolute top-3 left-3`}>
        <ChevronLeft className="w-5 h-5" strokeWidth={1.8} />
      </button>

      {/* View similar + share along the bottom edge */}
      <button
        type="button"
        onClick={onViewSimilar}
        className="absolute left-3 bottom-4 flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/90 text-ink text-sm shadow-sm backdrop-blur-sm cursor-pointer"
      >
        <Layers className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" />
        View Similar
      </button>
      <div className="absolute right-3 bottom-4 flex items-center gap-2">
        {shareNote && (
          <span className="text-2xs font-semibold bg-ink/80 text-white px-2 py-1 rounded-full" role="status">
            {shareNote}
          </span>
        )}
        <button type="button" onClick={share} aria-label="Share this product" className={overlayButton}>
          <Share2 className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>

      {/* Dash indicators (only with more than one photo) */}
      {images.length > 1 && (
        <div className="absolute bottom-1 inset-x-0 flex justify-center gap-1.5" aria-label="Choose image">
          {images.map((src, idx) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(idx)}
              aria-label={`Show image ${idx + 1} of ${images.length}`}
              aria-current={active === idx}
              className="py-1.5 cursor-pointer"
            >
              <span className={`block h-1 rounded-full transition-all duration-300 ${active === idx ? "w-5 bg-ink/80" : "w-3 bg-ink/30"}`} />
            </button>
          ))}
        </div>
      )}

      <ImageViewer
        open={viewerOpen}
        images={images}
        index={active}
        productName={productName}
        onIndexChange={(idx) => {
          setActive(idx);
          goTo(idx);
        }}
        onClose={() => setViewerOpen(false)}
      />
    </section>
  );
}
