/**
 * Programmatic Smooth Scroll for ANVAYA
 *
 * All user scrolling (mouse wheels, touchpads, touch screens, keyboard, scrollbar,
 * Ctrl+wheel zoom, scrolling inside modals and drawers) is left entirely to the
 * browser: no wheel events are intercepted or blocked, so input is never delayed.
 *
 * This module only animates explicit app actions, such as scroll-to-top on
 * navigation and scroll-to-catalogue links, with a calm ease-in-out.
 * - Any direct user input (wheel, key, pointer, touch) stops the animation instantly.
 * - Respects prefers-reduced-motion (programmatic scrolls jump instead of animating).
 *
 * CSS `scroll-behavior` stays `auto` so native input is never smoothed twice.
 */

// Programmatic scroll duration bounds (ms), scaled by distance travelled.
const PROGRAMMATIC_MIN_MS = 700;
const PROGRAMMATIC_MAX_MS = 1300;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Direct user input that should always win over a programmatic animation
const INTERRUPT_EVENTS = ["wheel", "keydown", "pointerdown", "touchstart"] as const;

class SmoothScrollEngine {
  private rafId: number = 0;
  private isInitialized: boolean = false;

  // Animation state
  private startY: number = 0;
  private targetY: number = 0;
  private startTime: number = 0;
  private duration: number = 0;
  private isFirstFrame: boolean = false;

  public init() {
    if (typeof window === "undefined" || this.isInitialized) return;
    this.isInitialized = true;
    // Passive listeners: they only observe input and can never delay native scrolling
    INTERRUPT_EVENTS.forEach((type) =>
      window.addEventListener(type, this.handleUserInterrupt, { passive: true })
    );
  }

  public destroy() {
    if (typeof window === "undefined") return;
    INTERRUPT_EVENTS.forEach((type) => window.removeEventListener(type, this.handleUserInterrupt));
    this.stop();
    this.isInitialized = false;
  }

  /**
   * Smoothly scroll the page to an absolute vertical position.
   */
  public scrollToY(y: number) {
    if (typeof window === "undefined") return;
    this.stop();
    const destination = Math.max(0, Math.min(y, this.maxScroll()));

    if (this.prefersReducedMotion()) {
      window.scrollTo({ top: destination, behavior: "instant" });
      return;
    }

    const distance = Math.abs(destination - window.scrollY);
    if (distance < 1) return;

    this.startY = window.scrollY;
    this.targetY = destination;
    this.startTime = performance.now();
    this.duration = Math.min(
      PROGRAMMATIC_MAX_MS,
      Math.max(PROGRAMMATIC_MIN_MS, PROGRAMMATIC_MIN_MS + distance * 0.12)
    );
    this.isFirstFrame = true;
    this.rafId = requestAnimationFrame(this.step);
  }

  /**
   * Smoothly scroll so an element's top aligns with the viewport top
   * (honours the element's CSS scroll-margin-top, like scrollIntoView).
   */
  public scrollToElement(el: Element | null) {
    if (!el) return;
    const marginTop = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
    const top = el.getBoundingClientRect().top + window.scrollY - marginTop;
    this.scrollToY(top);
  }

  public scrollToTop() {
    this.scrollToY(0);
  }

  public stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private prefersReducedMotion(): boolean {
    return !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  private maxScroll(): number {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  // The animation owns the scroll position until it finishes, so browser adjustments
  // (scroll anchoring or clamping while a view changes) cannot strand it midway.
  private step = (now: number) => {
    if (this.isFirstFrame) {
      // Start from where the page actually is once the new view has rendered (a shorter
      // page clamps the old position), so motion begins on the very first frame.
      this.isFirstFrame = false;
      this.startY = window.scrollY;
      this.startTime = now;
    }
    const progress = Math.min(1, (now - this.startTime) / this.duration);
    const y = this.startY + (this.targetY - this.startY) * easeInOutCubic(progress);
    // "instant" guarantees no native smooth animation stacks on top of ours
    window.scrollTo({ top: y, behavior: "instant" });
    this.rafId = progress < 1 ? requestAnimationFrame(this.step) : 0;
  };

  private handleUserInterrupt = () => {
    this.stop();
  };
}

export const smoothScroll = new SmoothScrollEngine();
