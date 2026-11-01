import { AlertCircle } from "lucide-react";

/**
 * Shown under the size buttons when Add to Cart or Order on WhatsApp is pressed before a size is
 * chosen (product page and Quick View). Announced to screen readers as it appears.
 */
export default function SizePrompt({ id }: { id: string }) {
  return (
    <div id={id} role="alert">
      <div className="status-note status-note-danger">
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Please choose a size first, then add it to your bag.</span>
      </div>
    </div>
  );
}

/** Focuses the first size that can be chosen in a size group, without jumping the page */
export const focusFirstSize = (group: HTMLElement | null) =>
  group?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
