import { ReactNode } from "react";
import { motion } from "motion/react";
import { MOTION_EASE } from "../utils/motion";

/**
 * Fades its content in with a slight rise the first time it scrolls into view, so pages
 * unfold as the visitor moves down them. Runs once per element; with "reduce motion" on
 * (MotionConfig reducedMotion="user" in main.tsx) only the fade remains.
 *
 * `delay` staggers neighbours, e.g. a grid's cards: (index % columns) * 0.07.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  id,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  id?: string;
}) {
  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      // Starts a little before the element is fully on screen, so fast scrolling never shows empty space
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.8, ease: MOTION_EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger for the nth item in a grid of `columns`: neighbours in a row arrive one after another */
export const staggerDelay = (index: number, columns = 4) => (index % columns) * 0.07;
