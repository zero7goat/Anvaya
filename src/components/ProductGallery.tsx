import { Fragment, useEffect, useRef, useState, MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Expand, X, ZoomIn } from "lucide-react";
import { OVERLAY_MOTION } from "../utils/motion";
import ProductImage, { ImagePlaceholder } from "./ProductImage";
import { IMAGE_WIDTHS, imageAtWidth, responsiveImage } from "../utils/imageSources";

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

// Magnification of the hover zoom (product detail page only)
const ZOOM_FACTOR = 2.2;
// Widest version requested for the zoom and full-screen views (source photos are 900px wide)
const ZOOM_SOURCE_WIDTH = 900;

// True on devices with a precise pointer that can hover (desktop mouse / trackpad)
function useHoverZoomSupport(): boolean {
  const query = "(hover: hover) and (pointer: fine)";
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return matches;
}

/**
 * Product detail gallery: main image, thumbnails, a desktop hover magnifier that
 * stays inside the image frame, and a full-screen viewer (tap / click / keyboard).
 * This is the only place on the site where product imagery is magnified.
 */
export default function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [activeImage, setActiveImage] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const canHoverZoom = useHoverZoomSupport();

  const src = images[activeImage];
  const altFor = (idx: number) =>
    images.length > 1 ? `${productName}, image ${idx + 1} of ${images.length}` : productName;

  // No photographs yet: one neutral placeholder frame, no zoom or viewer
  if (images.length === 0) {
    return (
      <section aria-label="Product images">
        <ImagePlaceholder className="aspect-[3/4] w-full" label={productName} />
      </section>
    );
  }

  return (
    <section aria-label="Product images">
      {/* Keyed by image so zoom state resets when the shopper switches images */}
      <Fragment key={src}>
        <ZoomFrame
          src={src}
          alt={altFor(activeImage)}
          hoverZoom={canHoverZoom}
          onOpenViewer={() => setViewerOpen(true)}
        />
      </Fragment>

      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-3" role="group" aria-label="Choose image">
          {images.map((thumb, idx) => (
            <button
              key={thumb}
              type="button"
              onClick={() => setActiveImage(idx)}
              aria-label={`Show image ${idx + 1} of ${images.length}`}
              aria-pressed={idx === activeImage}
              className={`relative aspect-[3/4] overflow-hidden cursor-pointer transition-opacity duration-300 ${
                idx === activeImage ? "opacity-100" : "opacity-55 hover:opacity-85"
              }`}
            >
              <ProductImage src={thumb} alt="" className="w-full h-full object-cover" compact />
              {/* Selected marker sits below the image, not around it */}
              <span
                className={`absolute inset-x-0 bottom-0 h-0.5 bg-maroon-800 transition-opacity duration-300 ${
                  idx === activeImage ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          ))}
        </div>
      )}

      <ImageViewer
        open={viewerOpen}
        images={images}
        index={activeImage}
        productName={productName}
        onIndexChange={setActiveImage}
        onClose={() => setViewerOpen(false)}
      />
    </section>
  );
}

/**
 * Main image with the hover magnifier. The magnified copy is a second <img> inside
 * the clipped frame, moved with left/top (never transform/scale), so the frame and
 * the surrounding layout never change size.
 */
function ZoomFrame({
  src,
  alt,
  hoverZoom,
  onOpenViewer,
}: {
  src: string;
  alt: string;
  hoverZoom: boolean;
  onOpenViewer: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const zoomImgRef = useRef<HTMLImageElement>(null);
  const naturalRatio = useRef<number>(0); // width / height of the source image
  const rafId = useRef<number>(0);
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const [zooming, setZooming] = useState(false);
  const [failed, setFailed] = useState(false);
  // The full-size zoom image is only requested once the shopper first hovers
  const [zoomRequested, setZoomRequested] = useState(false);
  const mainSources = responsiveImage(src, IMAGE_WIDTHS.product);
  const zoomSrc = imageAtWidth(src, ZOOM_SOURCE_WIDTH);

  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  // Size the magnified image to cover the frame at ZOOM_FACTOR, then pan it so the
  // point under the cursor stays under the cursor.
  const positionZoom = () => {
    rafId.current = 0;
    const frame = frameRef.current;
    const img = zoomImgRef.current;
    if (!frame || !img) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const ratio = naturalRatio.current || fw / fh;
    // "cover" size of the source in the frame, then magnified
    const coverW = ratio > fw / fh ? fh * ratio : fw;
    const coverH = coverW / ratio;
    const zw = coverW * ZOOM_FACTOR;
    const zh = coverH * ZOOM_FACTOR;
    img.style.width = `${zw}px`;
    img.style.height = `${zh}px`;
    img.style.left = `${-(zw - fw) * pointer.current.x}px`;
    img.style.top = `${-(zh - fh) * pointer.current.y}px`;
  };

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!hoverZoom || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    pointer.current = {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
    // One layout write per frame keeps the follow immediate without jank
    if (!rafId.current) rafId.current = requestAnimationFrame(positionZoom);
  };

  // An image that cannot be loaded shows the missing-image state: no zoom, no viewer
  if (failed) {
    return <ImagePlaceholder className="aspect-[3/4] w-full" label={alt} />;
  }

  return (
    <div
      ref={frameRef}
      className="pdp-zoom-frame aspect-[3/4] w-full bg-surface-muted"
      data-zooming={hoverZoom && zooming}
      onMouseEnter={(e) => {
        if (!hoverZoom) return;
        setZoomRequested(true);
        setZooming(true);
        handleMove(e);
      }}
      onMouseMove={handleMove}
      onMouseLeave={() => setZooming(false)}
    >
      <button
        type="button"
        onClick={onOpenViewer}
        aria-label={`Open full-screen view of ${alt}`}
        className="block w-full h-full cursor-zoom-in focus-visible:-outline-offset-2"
      >
        <img
          src={mainSources.src}
          srcSet={mainSources.srcSet}
          sizes={mainSources.srcSet ? "(min-width: 1024px) 45vw, 100vw" : undefined}
          alt={alt}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          id="product-main-image"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) naturalRatio.current = img.naturalWidth / img.naturalHeight;
          }}
          onError={() => setFailed(true)}
        />
      </button>

      {hoverZoom && zoomRequested && (
        <div className="pdp-zoom-layer" aria-hidden="true">
          <img
            ref={zoomImgRef}
            src={zoomSrc}
            alt=""
            referrerPolicy="no-referrer"
            decoding="async"
            className="pdp-zoom-image"
            onLoad={positionZoom}
          />
        </div>
      )}

      <span className="pdp-zoom-hint" aria-hidden="true">
        {hoverZoom ? <ZoomIn className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
        {hoverZoom ? "Hover to zoom" : "Tap to enlarge"}
      </span>
    </div>
  );
}

/**
 * Full-screen image viewer. Native scrolling and pinch-zoom work inside it, so it
 * suits touch devices; arrow keys switch images and Escape closes.
 */
export function ImageViewer({
  open,
  images,
  index,
  productName,
  onIndexChange,
  onClose,
}: {
  open: boolean;
  images: string[];
  index: number;
  productName: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const hasMany = images.length > 1;
  const go = (delta: number) => onIndexChange((index + delta + images.length) % images.length);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (hasMany && e.key === "ArrowRight") go(1);
      else if (hasMany && e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [open, index, hasMany]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="image-viewer"
          {...OVERLAY_MOTION.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} images`}
          className="fixed inset-0 z-50 bg-ink/95 flex items-center justify-center overflow-auto overscroll-contain"
          id="product-image-viewer"
          onClick={onClose}
        >
          <img
            src={imageAtWidth(images[index], ZOOM_SOURCE_WIDTH)}
            alt={hasMany ? `${productName}, image ${index + 1} of ${images.length}` : productName}
            referrerPolicy="no-referrer"
            className="max-h-[92vh] max-w-full object-contain select-none"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close full-screen view"
            className="btn-icon rounded-xs fixed top-4 right-4 bg-white/10 !text-white hover:!bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>

          {hasMany && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                aria-label="Previous image"
                className="btn-icon rounded-xs fixed left-4 top-1/2 -translate-y-1/2 bg-white/10 !text-white hover:!bg-white/20"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                aria-label="Next image"
                className="btn-icon rounded-xs fixed right-4 top-1/2 -translate-y-1/2 bg-white/10 !text-white hover:!bg-white/20"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="fixed bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80 tabular-nums">
                {index + 1} / {images.length}
              </span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
