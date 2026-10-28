import { Fragment, ReactNode, TouchEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CollectionType } from "../../types";
import { BOUTIQUE_CONFIG } from "../../config";
import { offerService } from "../../services/offerService";
import { SITE_IMAGES, HeroSlide } from "../../data/imageRegistry";
import { IMAGE_WIDTHS, imageAtWidth, responsiveImage } from "../../utils/imageSources";
import { SLIDE_VARIANTS } from "../../utils/motion";
import { formatINR } from "../../utils/productDisplay";
import { getStyleCards } from "./ShopByStyle";

const SLIDES = SITE_IMAGES.mobileHeroSlides;
const AUTOPLAY_MS = 5500;
const PRELOAD_DELAY_MS = 1500;
const SWIPE_THRESHOLD_PX = 40;
const slideSources = (slide: HeroSlide) => responsiveImage(slide.image, IMAGE_WIDTHS.mobileHero);

// Start downloading a banner (same size choice as the <img>), so it is ready before it slides in
const preloadSlide = (slide: HeroSlide) => {
  const { src, srcSet } = slideSources(slide);
  const img = new Image();
  img.referrerPolicy = "no-referrer";
  if (srcSet) {
    img.sizes = "100vw";
    img.srcset = srcSet;
  }
  img.src = src;
};

/**
 * Phone-width homepage hero: a full-bleed portrait carousel under the transparent
 * header. Slides move sideways; swipe left or right, tap a dot, or let it autoplay.
 * Then a scrolling offers strip and a row of arched style shortcuts.
 */
export default function MobileHero({
  onExploreClick,
  onShopCategory,
  onNavigateCollectionStyle,
}: {
  onExploreClick: () => void;
  onShopCategory: (category: string) => void;
  onNavigateCollectionStyle: (collection: CollectionType, style: string) => void;
}) {
  // direction: 1 = moving to the next slide (slides travel left), -1 = previous
  const [{ current, direction }, setSlide] = useState({ current: 0, direction: 1 });
  const touchStartX = useRef<number | null>(null);
  const goTo = (idx: number, dir: number) =>
    setSlide({ current: (idx + SLIDES.length) % SLIDES.length, direction: dir });

  // Autoplay (off for reduced-motion users); restarts after every manual change
  useEffect(() => {
    if (SLIDES.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => goTo(current + 1, 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [current]);

  // Fetch both neighbouring banners in the background (either swipe direction)
  const preloadNeighbours = () => {
    if (SLIDES.length < 2) return;
    preloadSlide(SLIDES[(current + 1) % SLIDES.length]);
    preloadSlide(SLIDES[(current - 1 + SLIDES.length) % SLIDES.length]);
  };
  useEffect(() => {
    const timer = setTimeout(preloadNeighbours, PRELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [current]);

  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    // A finger on the hero means a swipe may follow: make sure its target is loading
    preloadNeighbours();
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    // Swipe left = next slide, swipe right = previous
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) goTo(current + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  };

  const slide = SLIDES[current];
  const { src, srcSet } = slideSources(slide);

  return (
    <>
      {/* Slides always move sideways, even with the phone's "reduce motion" setting on:
          the visitor starts each swipe. Autoplay stays off for those visitors. */}
      <MotionConfig reducedMotion="never">
      <section
        className="relative w-full -mt-14 overflow-hidden select-none bg-maroon-950"
        id="mobile-hero"
        aria-roledescription="carousel"
        aria-label="Featured"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* 3:4 frame: slides move through it sideways, so the layout never shifts */}
        <div className="relative w-full aspect-[3/4] overflow-hidden cursor-pointer" onClick={onExploreClick}>
          <AnimatePresence initial={false} custom={direction}>
            <motion.img
              key={slide.id}
              src={src}
              srcSet={srcSet}
              sizes={srcSet ? "100vw" : undefined}
              alt={slide.alt}
              referrerPolicy="no-referrer"
              fetchPriority={current === 0 ? "high" : "auto"}
              decoding="async"
              draggable={false}
              custom={direction}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ objectPosition: slide.position }}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              aria-roledescription="slide"
              aria-label={`${current + 1} of ${SLIDES.length}`}
            />
          </AnimatePresence>
          {/* Darker top so the header stays readable on light photos */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
        </div>

        {/* Slide indicators: short dashes, the current one solid */}
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2 z-10" id="mobile-hero-dots">
          {SLIDES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(idx, idx >= current ? 1 : -1)}
              aria-label={`Go to slide ${idx + 1}`}
              aria-current={current === idx}
              className="py-2 cursor-pointer"
            >
              <span
                className={`block h-1 rounded-full transition-all duration-500 ${
                  current === idx ? "w-6 bg-white" : "w-4 bg-white/55"
                }`}
              />
            </button>
          ))}
        </div>
      </section>
      </MotionConfig>

      <OffersStrip />
      <StyleShortcuts onShopCategory={onShopCategory} onNavigateCollectionStyle={onNavigateCollectionStyle} />
    </>
  );
}

/** Scrolling strip of current offers: real coupon codes and shop services only. */
function OffersStrip() {
  const offers = offerService.getOffers().filter((o) => o.enabled);
  const cod = BOUTIQUE_CONFIG.paymentMethods.some((m) => m.id === "cod" && m.enabled);
  const items = [
    ...offers.map((o) => (
      <>
        Save more! Use <strong className="text-maroon-600 font-bold">{o.code}</strong> for{" "}
        {o.type === "percent" ? `${o.discountValue}% off` : `${formatINR(o.discountValue)} off`} on orders above{" "}
        {formatINR(o.minSpend)}
      </>
    )),
    <>Free shipping above {formatINR(BOUTIQUE_CONFIG.freeShippingThreshold)}</>,
    ...(cod ? [<>Cash on Delivery available</>] : []),
    <>Delivering across India</>,
  ];
  // Two identical copies scroll as one loop
  const run = (copy: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={copy > 0 || undefined}>
      {items.map((item, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap px-4">{item}</span>
          <span className="text-maroon-600/50" aria-hidden="true">|</span>
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className="bg-[#FBE3E3] text-ink text-sm py-2.5 overflow-hidden" id="mobile-offers-strip">
      <div className="offers-marquee flex w-max">
        {run(0)}
        {run(1)}
      </div>
    </div>
  );
}

// Cusped jharokha arch, in 0-1 units so it scales with each tile
const ARCH_PATH =
  "M0 1 L0 0.34 C0 0.22 0.08 0.16 0.18 0.14 C0.26 0.06 0.38 0.03 0.5 0 C0.62 0.03 0.74 0.06 0.82 0.14 C0.92 0.16 1 0.22 1 0.34 L1 1 Z";

/** Horizontal row of arch-framed shortcuts: Sale, then every style that has pieces. */
function StyleShortcuts({
  onShopCategory,
  onNavigateCollectionStyle,
}: {
  onShopCategory: (category: string) => void;
  onNavigateCollectionStyle: (collection: CollectionType, style: string) => void;
}) {
  const styles = getStyleCards().filter((c) => c.count > 0 && c.image);
  return (
    <nav aria-label="Shop by style" className="bg-surface py-4 border-b border-line" id="mobile-style-shortcuts">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <clipPath id="mobile-arch" clipPathUnits="objectBoundingBox">
          <path d={ARCH_PATH} />
        </clipPath>
      </svg>
      <ul className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li className="snap-start shrink-0">
          <button type="button" onClick={() => onShopCategory("Special Offers")} className="block w-[5.5rem] text-center cursor-pointer">
            <ArchFrame>
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-maroon-600 to-maroon-800">
                <span className="font-serif text-2xl font-bold text-gold-300 tracking-wide">SALE</span>
              </div>
            </ArchFrame>
            <span className="mt-1.5 block text-xs text-ink truncate">Offers</span>
          </button>
        </li>
        {styles.map((card) => (
          <li key={card.style} className="snap-start shrink-0">
            <button
              type="button"
              onClick={() => onNavigateCollectionStyle(card.collection, card.style)}
              className="block w-[5.5rem] text-center cursor-pointer"
            >
              <ArchFrame>
                <img
                  src={imageAtWidth(card.image, 360)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
              </ArchFrame>
              <span className="mt-1.5 block text-xs text-ink truncate">{card.style}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Arch-clipped tile with a thin gold outline following the same arch. */
function ArchFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-full aspect-[5/6]">
      <div className="absolute inset-0 bg-surface-muted" style={{ clipPath: "url(#mobile-arch)" }}>
        {children}
      </div>
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <path d={ARCH_PATH} fill="none" className="stroke-gold-500" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
