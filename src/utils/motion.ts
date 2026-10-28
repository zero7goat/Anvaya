/**
 * Shared motion tokens for `motion` (Framer Motion) animations.
 *
 * Mirrors the CSS tokens in src/index.css (--motion-*, --ease-anvaya) so JS-driven
 * and CSS-driven animations share one calm, slightly slower rhythm.
 */

// Gentle ease-out: quick to respond, long soft settle, no bounce or overshoot.
export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const MOTION_DURATION = {
  fast: 0.4, // small UI feedback: dropdowns, toggles
  base: 0.5, // ordinary transitions: fades, backdrops
  panel: 0.7, // larger entrances/exits: drawers, side panels
} as const;

export const MOTION_TRANSITION = {
  fast: { type: "tween", duration: MOTION_DURATION.fast, ease: MOTION_EASE },
  base: { type: "tween", duration: MOTION_DURATION.base, ease: MOTION_EASE },
  panel: { type: "tween", duration: MOTION_DURATION.panel, ease: MOTION_EASE },
} as const;

// Closing is quicker than opening, so dismissing never feels like waiting
const EXIT_TRANSITION = { type: "tween", duration: 0.3, ease: MOTION_EASE } as const;

/**
 * Carousel slide change: the current slide moves out to one side while the next moves
 * in from the other, like turning pages. Use with <AnimatePresence custom={direction}>,
 * where direction is 1 for "next" (move left) and -1 for "previous" (move right).
 */
export const SLIDE_VARIANTS = {
  enter: (direction: number) => ({ x: direction >= 0 ? "100%" : "-100%" }),
  center: { x: "0%", transition: MOTION_TRANSITION.panel },
  exit: (direction: number) => ({ x: direction >= 0 ? "-100%" : "100%", transition: MOTION_TRANSITION.panel }),
} as const;

/**
 * Enter/exit presets for every overlay (spread onto a motion element inside
 * AnimatePresence). Exits switch off pointer events immediately, so a closing
 * overlay never blocks the next click.
 */
export const OVERLAY_MOTION = {
  // Dimmed backdrop / overlay root
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: MOTION_TRANSITION.base },
    exit: { opacity: 0, pointerEvents: "none", transition: EXIT_TRANSITION },
  },
  // Centered dialogs: fade with a slight rise
  dialog: {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0, transition: MOTION_TRANSITION.base },
    exit: { opacity: 0, y: 8, pointerEvents: "none", transition: EXIT_TRANSITION },
  },
  // Side drawers
  drawerRight: {
    initial: { x: "100%" },
    animate: { x: 0, transition: MOTION_TRANSITION.panel },
    exit: { x: "100%", pointerEvents: "none", transition: { ...EXIT_TRANSITION, duration: 0.4 } },
  },
  drawerLeft: {
    initial: { x: "-100%" },
    animate: { x: 0, transition: MOTION_TRANSITION.panel },
    exit: { x: "-100%", pointerEvents: "none", transition: { ...EXIT_TRANSITION, duration: 0.4 } },
  },
} as const;
