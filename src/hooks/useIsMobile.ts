import { useEffect, useState } from "react";

// Below this width pages use their phone layouts (matches Tailwind's md breakpoint)
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * True while the viewport is phone-width. Read synchronously on first render, so a
 * component can render only its phone or only its desktop version and never load the
 * other one's images.
 */
export function useIsMobile(): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setMatches(mql.matches);
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return matches;
}
