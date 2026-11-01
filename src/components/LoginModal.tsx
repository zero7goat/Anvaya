import { useEffect, useRef, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OVERLAY_MOTION } from "../utils/motion";
import { BOUTIQUE_CONFIG } from "../config";
import { FloralSprig } from "./decor/Motifs";
import { DomeBorder } from "./AuthFormParts";
import { X, MessageSquare, ShoppingBag } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminLoginSuccess: () => void;
  onClientLoginSuccess: (username: string) => void;
  // Site footer, shown below the account area
  footer?: ReactNode;
}

/**
 * The "Account" page. Customer accounts don't exist yet, so this explains that none is
 * needed to order, instead of showing a sign-in form that would collect passwords and
 * store nothing. A full-screen, centred single-column view: brand mark at the top, the
 * message, floral sprigs at the page edges, a scalloped border, then the site footer.
 * Admin sign-in is separate and lives on the admin dashboard (/admin).
 */
export default function LoginModal({ isOpen, onClose, footer }: LoginModalProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const whatsappUrl = `https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber.replace(/\D/g, "")}`;

  // Focus the main action on open, close on Escape, and return focus to the trigger on close
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => primaryRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="login-modal"
          {...OVERLAY_MOTION.backdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-title"
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-canvas font-sans"
          id="login-modal-root"
        >
          <button
            onClick={onClose}
            className="btn-icon fixed top-3 right-3 sm:top-5 sm:right-5 z-10"
            aria-label="Close"
            id="close-login-btn"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Message fills the first screen; the site footer follows below it */}
          <div className="min-h-full flex flex-col items-center">
           <div className="relative w-full flex-1 flex flex-col items-center min-h-[100svh]">
            {/* Floral sprigs at the page edges (decorative; smaller and fainter on phones) */}
            <FloralSprig className="absolute left-0 top-28 md:top-1/2 md:-translate-y-1/2 h-48 md:h-[26rem] lg:h-[30rem] w-auto text-line-strong opacity-50 md:opacity-100" />
            <FloralSprig className="absolute right-0 bottom-20 md:bottom-auto md:top-1/2 md:-translate-y-1/2 h-48 md:h-[26rem] lg:h-[30rem] w-auto text-line-strong -scale-x-100 opacity-50 md:opacity-100" />

            {/* Brand mark */}
            <div className="flex flex-col items-center gap-2 pt-8 sm:pt-10 px-4" aria-hidden="true">
              <img src="/images/logo-144.png" width={159} height={144} alt="" className="h-11 sm:h-12 w-auto object-contain" decoding="async" />
              <span className="font-serif text-base tracking-[0.3em] text-ink uppercase">
                {BOUTIQUE_CONFIG.brandName}
              </span>
            </div>

            <motion.div
              {...OVERLAY_MOTION.dialog}
              className="relative w-full max-w-[450px] flex-1 flex flex-col justify-center px-4 pt-10 pb-20 text-center"
              id="login-card"
            >
              <h2 id="login-title" className="font-serif text-3xl sm:text-[2rem] text-ink">
                Your Account
              </h2>
              <p className="text-base text-ink/85 mt-3">
                Customer accounts aren't available yet, and you don't need one to shop.
              </p>
              <p className="text-sm text-muted mt-3 leading-relaxed">
                Add pieces to your bag and send it to us on WhatsApp. We'll confirm availability, the final amount
                and payment in the chat. You can also email{" "}
                <a href={`mailto:${BOUTIQUE_CONFIG.supportEmail}`} className="link">
                  {BOUTIQUE_CONFIG.supportEmail}
                </a>
                .
              </p>

              <button
                ref={primaryRef}
                type="button"
                onClick={onClose}
                className="w-full mt-8 h-16 flex items-center justify-center gap-2 bg-maroon-600 text-white text-base font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-maroon-700 cursor-pointer"
                id="login-continue-btn"
              >
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                Continue shopping
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full mt-3 h-[60px] flex items-center justify-center gap-3 border border-line-strong text-ink text-base transition-colors hover:bg-surface-muted hover:border-ink"
                id="login-whatsapp-link"
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                Questions? Message us on WhatsApp
              </a>
            </motion.div>

            {/* Scalloped dome border along the bottom of the area */}
            <DomeBorder patternId="login-domes" />
           </div>

            {footer && <div className="w-full">{footer}</div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
