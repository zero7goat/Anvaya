import React, { TouchEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { SLIDE_VARIANTS } from "../utils/motion";
import { ArrowRight } from "lucide-react";
import { BOUTIQUE_CONFIG } from "../config";
import { CollectionType, Product } from "../types";
import { productService } from "../services/productService";
import ServiceStrip from "./home/ServiceStrip";
import ProductRail from "./home/ProductRail";
import CollectionSpotlight from "./home/CollectionSpotlight";
import ShopByStyle from "./home/ShopByStyle";
import CustomerReviews from "./home/CustomerReviews";
import BrandStory from "./home/BrandStory";
import { SITE_IMAGES, HeroSlide } from "../data/imageRegistry";
import { IMAGE_WIDTHS, imageAtWidth, responsiveImage } from "../utils/imageSources";
import { BackgroundMotif } from "./decor/Motifs";
import MobileHero from "./home/MobileHero";
import { useIsMobile } from "../hooks/useIsMobile";


interface HeroProps {
  onExploreClick: () => void;
  onSelectCategory: (category: string) => void;
  onProductClick: (product: Pick<Product, "id">) => void;
  onQuickView: (product: Pick<Product, "id">) => void;
  onNavigateCollection?: (collection: CollectionType) => void;
  onNavigateCollectionStyle?: (collection: CollectionType, style: string) => void;
}

// Hero frames: all portrait panels together on the first slide, then each banner
type HeroFrame =
  | { id: string; kind: "banner"; slide: HeroSlide }
  | { id: string; kind: "panels"; panels: HeroSlide[] };

const HERO_PANELS = SITE_IMAGES.heroSlides.filter((s) => s.kind === "panel");
const HERO_FRAMES: HeroFrame[] = [
  ...(HERO_PANELS.length ? [{ id: "panels", kind: "panels" as const, panels: HERO_PANELS }] : []),
  ...SITE_IMAGES.heroSlides
    .filter((s) => s.kind === "banner")
    .map((slide) => ({ id: slide.id, kind: "banner" as const, slide })),
];

const HERO_AUTOPLAY_MS = 6500;
// Delay before the next slide is fetched in the background
const HERO_PRELOAD_DELAY_MS = 1500;

// One hero image; a failed load leaves the maroon frame instead of a broken-image icon
// Size-appropriate versions from the image host (banners fill the width; panels a third of it)
const heroSources = (slide: HeroSlide) =>
  responsiveImage(slide.image, slide.kind === "panel" ? IMAGE_WIDTHS.product : IMAGE_WIDTHS.hero);
const heroSizes = (slide: HeroSlide) => (slide.kind === "panel" ? "34vw" : "100vw");
const frameSlides = (frame: HeroFrame) => (frame.kind === "banner" ? [frame.slide] : frame.panels);

function HeroImage({ slide, priority = false }: { slide: HeroSlide; priority?: boolean }) {
  const { src, srcSet } = heroSources(slide);
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? heroSizes(slide) : undefined}
      alt={slide.alt}
      referrerPolicy="no-referrer"
      loading="eager"
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      style={{ objectPosition: slide.position }}
      className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none block"
    />
  );
}

export default function Hero({
  onExploreClick,
  onSelectCategory,
  onProductClick,
  onQuickView,
  onNavigateCollection,
  onNavigateCollectionStyle,
}: HeroProps) {
  // Hero carousel
  // direction: 1 = moving to the next slide (slides travel left), -1 = previous
  const [{ current: currentSlide, direction }, setSlide] = useState({ current: 0, direction: 1 });
  const touchStartX = useRef<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isMobile = useIsMobile();
  const activeFrame = HERO_FRAMES[currentSlide];
  const goToSlide = (idx: number, dir: number) =>
    setSlide({ current: (idx + HERO_FRAMES.length) % HERO_FRAMES.length, direction: dir });

  // Touch screens (tablets, touch laptops): swipe left for next, right for previous
  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40) goToSlide(currentSlide + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  };

  // Gentle autoplay; paused while hovered or focused, and off for reduced-motion users
  useEffect(() => {
    if (isMobile || isPaused || HERO_FRAMES.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => goToSlide(currentSlide + 1, 1), HERO_AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [currentSlide, isPaused, isMobile]);

  // Fetch the next slide in the background once the current one has had a head start,
  // so it is ready before autoplay or the arrows show it (no blank frame mid-fade)
  useEffect(() => {
    if (isMobile || HERO_FRAMES.length < 2) return;
    const next = HERO_FRAMES[(currentSlide + 1) % HERO_FRAMES.length];
    const timer = setTimeout(() => {
      frameSlides(next).forEach((slide) => {
        const { src, srcSet } = heroSources(slide);
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        if (srcSet) {
          img.sizes = heroSizes(slide);
          img.srcset = srcSet;
        }
        img.src = src;
      });
    }, HERO_PRELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [currentSlide, isMobile]);

  // Live piece counts shown under each collection arch
  const collectionCounts: Record<CollectionType, number> = {
    alankritha: productService.getProducts({ collection: "alankritha" }).length,
    ayanaa: productService.getProducts({ collection: "ayanaa" }).length,
  };

  const handleCollectionNav = (col: CollectionType) => {
    if (onNavigateCollection) {
      onNavigateCollection(col);
    } else {
      onSelectCategory(col === "alankritha" ? "Kurtas" : "Sarees");
    }
  };

  return (
    <div className="w-full bg-canvas flex flex-col font-sans" id="anvaya-homepage-sections">
      
      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: HERO CAROUSEL (full-bleed, header overlaid); phones get the portrait version */}
      {/* ------------------------------------------------------------- */}
      {isMobile ? (
        <MobileHero
          onExploreClick={onExploreClick}
          onShopCategory={onSelectCategory}
          onNavigateCollectionStyle={(col, style) => (onNavigateCollectionStyle ? onNavigateCollectionStyle(col, style) : handleCollectionNav(col))}
        />
      ) : (
      <section
        className="relative w-full -mt-14 sm:-mt-16 overflow-hidden select-none bg-maroon-950"
        id="hero-banner-viewport"
        aria-roledescription="carousel"
        aria-label="Featured"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          onClick={onExploreClick}
          className="relative w-full aspect-[2/1] max-h-[88vh] cursor-pointer"
          title="Explore Handcrafted Indian Ethnic Wear by Anvaya"
        >
          {/* Slides move sideways through a fixed-size frame, so changing slides never shifts the layout.
              They always slide (even with "reduce motion" on), since the visitor starts each change */}
          <MotionConfig reducedMotion="never">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={activeFrame.id}
              custom={direction}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
              aria-roledescription="slide"
              aria-label={`${currentSlide + 1} of ${HERO_FRAMES.length}`}
            >
              {activeFrame.kind === "banner" ? (
                <HeroImage slide={activeFrame.slide} priority={currentSlide === 0} />
              ) : (
                <>
                  {/* Portrait photos side by side; each already carries its own caption */}
                  <div
                    className="absolute inset-0 grid"
                    style={{ gridTemplateColumns: `repeat(${activeFrame.panels.length}, minmax(0, 1fr))` }}
                  >
                    {activeFrame.panels.map((panel) => (
                      <div key={panel.id} className="relative overflow-hidden">
                        <HeroImage slide={panel} priority={currentSlide === 0} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          </MotionConfig>
        </div>

        {/* Slide indicators */}
        <div
          className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2 z-20"
          id="hero-carousel-dots"
        >
          {HERO_FRAMES.map((frame, idx) => (
            <button
              key={frame.id}
              onClick={() => goToSlide(idx, idx >= currentSlide ? 1 : -1)}
              className={`transition-all duration-500 cursor-pointer ${
                currentSlide === idx
                  ? "w-8 sm:w-10 h-1 bg-white rounded-full"
                  : "w-1.5 h-1.5 bg-white/70 hover:bg-white rounded-full"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
              aria-current={currentSlide === idx}
            />
          ))}
        </div>
      </section>
      )}

      <ServiceStrip />

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: OUR COLLECTIONS (2 ARCHED JHAROKHA CARDS) */}
      {/* ------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden w-full section-y" id="our-collections-section">
        <BackgroundMotif kind="mandala" className="-left-20 md:-left-24 top-4 md:top-10 w-44 h-44 md:w-72 md:h-72" />
        <BackgroundMotif kind="mandala" className="-right-20 md:-right-28 bottom-4 md:bottom-6 w-48 h-48 md:w-80 md:h-80" />
        <div className="relative container-page">
          
          {/* Section Heading: Centered uppercase serif matching wireframe */}
          <p className="eyebrow text-center mb-2">Shop by collection</p>
          <h2 className="heading-section text-center mb-10 sm:mb-12 select-none">
            OUR COLLECTIONS
          </h2>

          {/* 2 Arched Cards Side-by-Side: Alankritha & Ayanaa */}
          <div className="grid grid-cols-2 gap-4 sm:gap-8 md:gap-14 max-w-2xl sm:max-w-3xl mx-auto">
            
            {/* Card 1: ALANKRITHA (Kurtas) with Jharokha Arch Shape */}
            <div
              onClick={() => handleCollectionNav("alankritha")}
              className="group cursor-pointer flex flex-col items-center select-none"
              id="arch-card-alankritha"
              title="Explore Alankritha - Exclusively Women's Kurtas"
            >
              <div className="relative w-full aspect-[3/4] max-w-[280px] drop-shadow-md transition-all duration-700 group-hover:-translate-y-1 group-hover:drop-shadow-xl">
                <svg
                  viewBox="0 0 300 400"
                  className="w-full h-full overflow-visible"
                >
                  <defs>
                    <clipPath id="arch-clip-alankritha">
                      <path d="M 150,2 C 145,10 132,18 116,26 C 62,44 0,92 0,156 L 0,384 Q 0,400 16,400 L 284,400 Q 300,400 300,384 L 300,156 C 300,92 238,44 184,26 C 168,18 155,10 150,2 Z" />
                    </clipPath>
                    {/* Deep rich maroon backdrop gradient matching wireframe */}
                    <linearGradient id="maroon-grad-1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4A0A0E" />
                      <stop offset="100%" stopColor="#250305" />
                    </linearGradient>
                  </defs>

                  {/* Fallback rich fill matching diagram placeholder */}
                  <rect width="300" height="400" fill="url(#maroon-grad-1)" clipPath="url(#arch-clip-alankritha)" />

                  {/* Collection cover (from the image registry) */}
                  <ArchCover src={SITE_IMAGES.collectionCovers.alankritha} clipId="arch-clip-alankritha" />

                  {/* Subtle Dark Luxury Scrim */}
                  <path
                    d="M 150,2 C 145,10 132,18 116,26 C 62,44 0,92 0,156 L 0,384 Q 0,400 16,400 L 284,400 Q 300,400 300,384 L 300,156 C 300,92 238,44 184,26 C 168,18 155,10 150,2 Z"
                    fill="rgba(30, 5, 8, 0.25)"
                  />
                </svg>
              </div>

              {/* Sub-label */}
              <div className="text-center mt-3.5 sm:mt-4 flex flex-col items-center">
                <span className="font-serif text-base sm:text-lg tracking-[0.12em] text-ink uppercase block group-hover:text-maroon-600 transition-colors">
                  Alankritha
                </span>
                <span className="eyebrow">
                  Women's Kurtas
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted group-hover:text-ink transition-colors">
                  {collectionCounts.alankritha} pieces
                  <ArrowRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </div>

            {/* Card 2: AYANAA (Sarees) with Jharokha Arch Shape */}
            <div
              onClick={() => handleCollectionNav("ayanaa")}
              className="group cursor-pointer flex flex-col items-center select-none"
              id="arch-card-ayanaa"
              title="Explore Ayanaa - Exclusively Women's Sarees"
            >
              <div className="relative w-full aspect-[3/4] max-w-[280px] drop-shadow-md transition-all duration-700 group-hover:-translate-y-1 group-hover:drop-shadow-xl">
                <svg
                  viewBox="0 0 300 400"
                  className="w-full h-full overflow-visible"
                >
                  <defs>
                    <clipPath id="arch-clip-ayanaa">
                      <path d="M 150,2 C 145,10 132,18 116,26 C 62,44 0,92 0,156 L 0,384 Q 0,400 16,400 L 284,400 Q 300,400 300,384 L 300,156 C 300,92 238,44 184,26 C 168,18 155,10 150,2 Z" />
                    </clipPath>
                    <linearGradient id="maroon-grad-2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4A0A0E" />
                      <stop offset="100%" stopColor="#250305" />
                    </linearGradient>
                  </defs>

                  {/* Fallback rich fill */}
                  <rect width="300" height="400" fill="url(#maroon-grad-2)" clipPath="url(#arch-clip-ayanaa)" />

                  {/* Collection cover (from the image registry) */}
                  <ArchCover src={SITE_IMAGES.collectionCovers.ayanaa} clipId="arch-clip-ayanaa" />

                  {/* Subtle Dark Luxury Scrim */}
                  <path
                    d="M 150,2 C 145,10 132,18 116,26 C 62,44 0,92 0,156 L 0,384 Q 0,400 16,400 L 284,400 Q 300,400 300,384 L 300,156 C 300,92 238,44 184,26 C 168,18 155,10 150,2 Z"
                    fill="rgba(30, 5, 8, 0.25)"
                  />
                </svg>
              </div>

              {/* Sub-label */}
              <div className="text-center mt-3.5 sm:mt-4 flex flex-col items-center">
                <span className="font-serif text-base sm:text-lg tracking-[0.12em] text-ink uppercase block group-hover:text-maroon-600 transition-colors">
                  Ayanaa
                </span>
                <span className="eyebrow">
                  Women's Sarees
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted group-hover:text-ink transition-colors">
                  {collectionCounts.ayanaa} pieces
                  <ArrowRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Collection spotlights, product edit, styles, reviews and brand story */}
      <ProductRail onProductClick={onProductClick} onQuickView={onQuickView} onViewAll={onSelectCategory} />

      <CollectionSpotlight
        collectionKey="alankritha"
        onNavigateCollection={handleCollectionNav}
        onProductClick={onProductClick}
        onQuickView={onQuickView}
      />

      {onNavigateCollectionStyle && <ShopByStyle onNavigateCollectionStyle={onNavigateCollectionStyle} />}

      <CollectionSpotlight
        collectionKey="ayanaa"
        reverse
        onNavigateCollection={handleCollectionNav}
        onProductClick={onProductClick}
        onQuickView={onQuickView}
      />

      <CustomerReviews onProductClick={onProductClick} />

      <BrandStory onNavigateCollection={handleCollectionNav} />

    </div>
  );
}

/**
 * Arched collection cover. Shows the registry image clipped to the arch; with no
 * image (or one that fails to load) the maroon arch stays, with a quiet caption.
 */
function ArchCover({ src, clipId }: { src: string; clipId: string }) {
  const [failed, setFailed] = useState(false);
  // SVG images cannot lazy-load, so the cover is only requested once it nears the screen
  const sentinelRef = useRef<SVGRectElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  if (!src || failed) {
    return (
      <text
        x="150"
        y="215"
        textAnchor="middle"
        fill="#E5D2B8"
        fontSize="11"
        letterSpacing="2.4"
        style={{ fontFamily: "var(--font-sans)", fontWeight: 600, textTransform: "uppercase" }}
      >
        Imagery coming soon
      </text>
    );
  }
  return (
    <>
      <rect ref={sentinelRef} width="300" height="400" fill="none" />
      {near && (
        <image
          href={imageAtWidth(src, 600)}
          width="300"
          height="400"
          preserveAspectRatio="xMidYMid slice"
          clipPath={"url(#" + clipId + ")"}
          onError={() => setFailed(true)}
        />
      )}
    </>
  );
}
