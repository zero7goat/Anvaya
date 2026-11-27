import { Fragment, ReactNode, TouchEvent, useEffect, useRef, useState } from "react";
import { CollectionType } from "../../types";
import { BOUTIQUE_CONFIG } from "../../config";
import { SITE_IMAGES, HeroSlide } from "../../data/imageRegistry";
import { IMAGE_WIDTHS, imageAtWidth, responsiveImage } from "../../utils/imageSources";
import { getStyleCards } from "./ShopByStyle";

const SLIDES = SITE_IMAGES.mobileHeroSlides;
const AUTOPLAY_MS = 5500;
// Delay before the next banner starts downloading on first load
const PRELOAD_DELAY_MS = 1500;
const SWIPE_THRESHOLD_PX = 40;
const slideSources = (slide: HeroSlide) => responsiveImage(slide.image, IMAGE_WIDTHS.mobileHero);

// Position of slide i relative to the current one: 0 = on screen, 1 = waiting on the
// right, -1 = waiting on the left, 2 = parked out of sight
const relativeOffset = (i: number, current: number) => {
  const n = SLIDES.length;
  const d = (i - current + n) % n;
  if (d === 0) return 0;
  if (d === 1) return 1;
  if (d === n - 1) return -1;
  return 2;
};

type Carousel = {
  current: number;
  // Slide that just moved out (it keeps sliding off to the side)
  previous: number | null;
  // 1 = moving to the next slide (slides travel left), -1 = moving back (travel right)
  direction: number;
  // Slide placed just off-screen, ready to slide in after a jump to a non-adjacent dot
  staged: number | null;
};

/**
 * Phone-width homepage hero: a full-bleed portrait carousel under the transparent
 * header. Every banner sits side by side; changing slides moves the current banner
 * out to the left (or right) while the next one moves in beside it, like the desktop
 * hero. The banner follows the finger while swiping. Movement is a plain CSS
 * transition (see .hero-slide in index.css). Then a scrolling offers strip and a row
 * of arched style shortcuts.
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
  const [{ current, previous, direction, staged }, setCarousel] = useState<Carousel>({
    current: 0,
    previous: null,
    direction: 1,
    staged: null,
  });
  // Finger drag in progress (px), or null when not dragging
  const [dragX, setDragX] = useState<number | null>(null);
  // Slides whose images have been requested; they stay rendered so they never reload
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0]));
  // Gesture in progress; dx is kept here too so the release always sees the latest drag
  const touch = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Each slide's position in the previous render, to avoid animating a slide across the screen
  const lastShift = useRef<Record<number, number>>({});

  const goTo = (idx: number, dir: number) => {
    const target = (idx + SLIDES.length) % SLIDES.length;
    if (target === current) return;
    setLoaded((prev) => (prev.has(target) ? prev : new Set([...prev, target])));
    const commit = () => setCarousel({ current: target, previous: current, direction: dir, staged: null });
    if (relativeOffset(target, current) === dir) {
      commit();
    } else {
      // Not already waiting on the right side: place it there first, then slide it in
      setCarousel((c) => ({ ...c, staged: target, direction: dir }));
      setTimeout(commit, 40);
    }
  };

  // The next banner (where autoplay goes); the previous one too once a finger is on
  // the banner, since a swipe can go either way
  const loadNeighbours = (both: boolean) =>
    setLoaded((prev) => {
      const n = SLIDES.length;
      const want = [current, (current + 1) % n, ...(both ? [(current - 1 + n) % n] : [])];
      return want.every((i) => prev.has(i)) ? prev : new Set([...prev, ...want]);
    });

  // Autoplay (off for reduced-motion users and while a finger is on the banner)
  useEffect(() => {
    if (SLIDES.length < 2 || dragX !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => goTo(current + 1, 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [current, dragX]);

  // Load the next banner (after a short head start on first load) so it is ready in time
  useEffect(() => {
    const timer = setTimeout(() => loadNeighbours(false), previous === null ? PRELOAD_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [current]);

  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, horizontal: null };
    loadNeighbours(true);
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    // Decide once whether this gesture is a sideways swipe or a page scroll
    if (t.horizontal === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) t.horizontal = Math.abs(dx) > Math.abs(dy);
    if (t.horizontal) {
      t.dx = dx;
      setDragX(dx);
    }
  };
  const onTouchEnd = () => {
    const t = touch.current;
    touch.current = null;
    const dx = t?.dx ?? 0;
    setDragX(null);
    if (!t?.horizontal) return;
    // Swipe left = next slide, swipe right = previous; a short drag springs back
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) goTo(current + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  };

  const width = frameRef.current?.clientWidth || 1;

  // Where each slide sits (in % of the frame width) and whether it glides there
  const placement = (i: number) => {
    const offset = relativeOffset(i, current);
    let shift: number;
    if (dragX !== null) shift = offset * 100 + (Math.abs(offset) <= 1 ? (dragX / width) * 100 : 0);
    else if (i === staged) shift = direction * 100;
    else if (i === current) shift = 0;
    else if (i === previous) shift = -direction * 100;
    else shift = offset * 100;
    const visible = shift > -200 && shift < 200;
    const before = lastShift.current[i];
    // Glide unless dragging or staging, and never sweep a slide across from one side to the other
    const crosses = before !== undefined && before * shift < 0;
    const animates = dragX === null && staged === null && visible && !crosses;
    return { shift, visible, animates };
  };
  const placements = SLIDES.map((_, i) => placement(i));
  useEffect(() => {
    placements.forEach((p, i) => (lastShift.current[i] = p.shift));
  });

  return (
    <>
      <section
        className="relative w-full -mt-14 overflow-hidden select-none bg-maroon-950"
        id="mobile-hero"
        aria-roledescription="carousel"
        aria-label="Featured"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* 3:4 frame; vertical page scrolling still works over it (touch-action: pan-y) */}
        <div
          ref={frameRef}
          className="relative w-full aspect-[3/4] overflow-hidden cursor-pointer touch-pan-y"
          onClick={onExploreClick}
        >
          {SLIDES.map((slide, i) => {
            const { shift, visible, animates } = placements[i];
            const { src, srcSet } = slideSources(slide);
            return (
              <div
                key={slide.id}
                className={`hero-slide absolute inset-0 ${animates ? "hero-slide-moving" : ""}`}
                style={{ transform: `translateX(${shift}%)`, visibility: visible ? "visible" : "hidden" }}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SLIDES.length}`}
                aria-hidden={i !== current}
              >
                {loaded.has(i) && (
                  // The shown slide drifts slowly closer (the wrapper moves; the image never scales)
                  <div key={i === current ? `on-${current}` : "off"} className={`w-full h-full ${i === current ? "hero-drift" : ""}`}>
                    <img
                      src={src}
                      srcSet={srcSet}
                      sizes={srcSet ? "100vw" : undefined}
                      alt={slide.alt}
                      referrerPolicy="no-referrer"
                      fetchPriority={i === 0 ? "high" : "auto"}
                      decoding="async"
                      draggable={false}
                      style={{ objectPosition: slide.position }}
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  </div>
                )}
              </div>
            );
          })}
          {/* Darker top so the header stays readable on light photos */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
        </div>

        {/* Slide indicators: short dashes, the current one solid */}
        <div className="absolute bottom-1 inset-x-0 flex justify-center gap-0.5 z-10" id="mobile-hero-dots">
          {SLIDES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(idx, idx > current ? 1 : -1)}
              aria-label={`Go to slide ${idx + 1}`}
              aria-current={current === idx}
              className="py-3 px-1 cursor-pointer"
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

      <OffersStrip />
      <StyleShortcuts onShopCategory={onShopCategory} onNavigateCollectionStyle={onNavigateCollectionStyle} />
    </>
  );
}

/** Scrolling strip of the shop's real services. */
function OffersStrip() {
  const cod = BOUTIQUE_CONFIG.paymentMethods.some((m) => m.id === "cod" && m.enabled);
  const items = [
    <>Free shipping</>,
    ...(cod ? [<>Cash on Delivery available</>] : []),
    ...(BOUTIQUE_CONFIG.onlinePayment.enabled ? [<>Secure online payment</>] : [<>Order on WhatsApp</>]),
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
                  src={imageAtWidth(card.image, 200)}
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
