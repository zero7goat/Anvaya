import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp } from "lucide-react";
import { smoothScroll } from "../utils/smoothScroll";
import { MOTION_TRANSITION } from "../utils/motion";

// Shown once the visitor is this far down a page
const SHOW_AFTER_PX = 1200;

/**
 * Round "back to top" button in the bottom corner of long pages. `raised` lifts it above
 * a bar fixed to the bottom of the screen (the product page's phone buy bar).
 */
export default function BackToTop({ raised = false }: { raised?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={() => smoothScroll.scrollToTop()}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITION.base }}
          exit={{ opacity: 0, y: 12, transition: MOTION_TRANSITION.fast }}
          aria-label="Back to top"
          title="Back to top"
          className={`fixed right-4 sm:right-6 z-30 w-11 h-11 rounded-full bg-maroon-950/90 text-white shadow-lg backdrop-blur-sm flex items-center justify-center cursor-pointer hover:bg-maroon-800 transition-colors ${
            raised ? "bottom-24 md:bottom-6" : "bottom-5 sm:bottom-6"
          }`}
        >
          <ArrowUp className="w-4 h-4" aria-hidden="true" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
