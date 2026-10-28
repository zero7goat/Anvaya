import { SyntheticEvent, useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { IMAGE_WIDTHS, imageAtWidth, responsiveImage } from "../utils/imageSources";

interface ProductImageProps {
  src: string;
  alt: string;
  // Sizing/fit classes; applied to the image, or to the placeholder in its place
  className?: string;
  // Small thumbnails (cart, checkout, admin) show the icon only and load a small file
  compact?: boolean;
  // Lazy by default; pass "eager" for images that are visible on first paint
  loading?: "eager" | "lazy";
  // Rendered width hint for choosing a srcset candidate (defaults suit product-card grids)
  sizes?: string;
  id?: string;
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void;
}

const CARD_SIZES = "(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw";
const THUMBNAIL_WIDTH = 360;

/**
 * Product photograph with a built-in missing-image state: an empty source, or an
 * image that fails to load, renders the same-sized "Image coming soon" placeholder
 * instead of a broken-image icon. Never substitutes a different photograph.
 * Requests a size-appropriate file from the image host where it supports resizing.
 */
export default function ProductImage({
  src,
  alt,
  className = "",
  compact = false,
  loading = "lazy",
  sizes = CARD_SIZES,
  id,
  onLoad,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  // A new source gets a fresh attempt
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return <ImagePlaceholder className={className} compact={compact} label={alt} />;
  }

  const sources = compact ? { src: imageAtWidth(src, THUMBNAIL_WIDTH) } : responsiveImage(src, IMAGE_WIDTHS.product);

  return (
    <img
      src={sources.src}
      srcSet={sources.srcSet}
      sizes={sources.srcSet ? sizes : undefined}
      alt={alt}
      id={id}
      referrerPolicy="no-referrer"
      className={className}
      loading={loading}
      decoding="async"
      onLoad={onLoad}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Neutral missing-image state shared by every product image surface.
 */
export function ImagePlaceholder({
  className = "",
  compact = false,
  label,
}: {
  className?: string;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label ? `${label}: image coming soon` : "Image coming soon"}
      className={`flex flex-col items-center justify-center gap-2 bg-surface-muted text-muted select-none ${className}`}
    >
      <ImageOff className={compact ? "w-4 h-4" : "w-6 h-6"} strokeWidth={1.5} aria-hidden="true" />
      {!compact && (
        <span className="text-2xs font-semibold uppercase tracking-[0.16em]">Image coming soon</span>
      )}
    </div>
  );
}
