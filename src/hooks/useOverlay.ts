import { RefObject, useEffect, useRef } from "react";

// Open overlays, newest last: Escape only closes the one on top
const openStack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = "";

/**
 * Shared behaviour for drawers and dialogs while `isOpen`: Escape closes the topmost
 * one, the page behind stops scrolling, focus moves into the panel, Tab stays inside
 * it, and focus returns to whatever opened it afterwards.
 */
export function useOverlay(isOpen: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol("overlay");
    openStack.push(id);
    const trigger = document.activeElement as HTMLElement | null;

    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    // Wait a frame so the panel exists before focusing it
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      const index = openStack.indexOf(id);
      if (index > -1) openStack.splice(index, 1);
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [isOpen, panelRef]);
}
