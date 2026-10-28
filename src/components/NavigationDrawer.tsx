import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Inbox, Mail, MapPin, MessageCircle, Plus, Search, ShoppingBag, User, X } from "lucide-react";
import { MOTION_TRANSITION, OVERLAY_MOTION } from "../utils/motion";
import { BOUTIQUE_CONFIG } from "../config";
import { CollectionType } from "../types";
import { COLLECTION_STYLES } from "./Footer";

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartCount: number;
  unreadEmails: number;
  currentUser: string | null;
  onSearch: () => void;
  onAccount: () => void;
  onCart: () => void;
  onInbox: () => void;
  onHome: () => void;
  onShopCategory: (category: string) => void;
  onNavigateCollection: (collection: CollectionType) => void;
  onNavigateCollectionStyle: (collection: CollectionType, style: string) => void;
}

type Tab = "home" | CollectionType;

/**
 * Left slide-in site menu (hamburger). Light top bar with close, search, account and
 * bag; tabs for Home and the two collections; a link list where some rows expand; and
 * a muted panel with account and contact links.
 */
export default function NavigationDrawer({
  isOpen,
  onClose,
  cartCount,
  unreadEmails,
  currentUser,
  onSearch,
  onAccount,
  onCart,
  onInbox,
  onHome,
  onShopCategory,
  onNavigateCollection,
  onNavigateCollectionStyle,
}: NavigationDrawerProps) {
  const [tab, setTab] = useState<Tab>("home");
  const [expanded, setExpanded] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { collections } = BOUTIQUE_CONFIG;
  const whatsappUrl = `https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber}`;

  // Focus the close button on open, close on Escape, return focus to the trigger on close
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [isOpen]);

  // Run a menu action, then close the drawer
  const go = (action: () => void) => () => {
    action();
    onClose();
  };

  const selectTab = (next: Tab) => {
    setTab(next);
    setExpanded(null);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "alankritha", label: collections.alankritha.name },
    { id: "ayanaa", label: collections.ayanaa.name },
  ];

  const renderLinks = () => {
    if (tab === "home") {
      return (
        <>
          <MenuLink onClick={go(onHome)}>Home</MenuLink>
          <MenuLink onClick={go(() => onShopCategory("New Arrivals"))} accent>
            New Arrivals
          </MenuLink>
          <MenuLink onClick={go(() => onShopCategory("Best Sellers"))}>Best Sellers</MenuLink>
          <MenuLink onClick={go(() => onShopCategory("Special Offers"))}>Special Offers</MenuLink>
          <ExpandableLink
            label="Our Collections"
            open={expanded === "collections"}
            onToggle={() => setExpanded(expanded === "collections" ? null : "collections")}
          >
            {(["alankritha", "ayanaa"] as CollectionType[]).map((col) => (
              <Fragment key={col}>
                <SubLink onClick={go(() => onNavigateCollection(col))}>
                  {collections[col].name} · {collections[col].category}
                </SubLink>
              </Fragment>
            ))}
          </ExpandableLink>
          <MenuLink onClick={go(() => onShopCategory("All"))}>All Products</MenuLink>
        </>
      );
    }
    const col = tab;
    return (
      <>
        {COLLECTION_STYLES[col].map((style) => (
          <Fragment key={style}>
            <MenuLink onClick={go(() => onNavigateCollectionStyle(col, style))}>{style}</MenuLink>
          </Fragment>
        ))}
        <MenuLink onClick={go(() => onNavigateCollection(col))}>
          All {collections[col].name} {collections[col].category}
        </MenuLink>
      </>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="navigation-drawer" exit={{ pointerEvents: "none" }} className="fixed inset-0 z-50 flex" id="navigation-drawer">
          <motion.div {...OVERLAY_MOTION.backdrop} className="overlay-backdrop" onClick={onClose} />

          <motion.nav
            {...OVERLAY_MOTION.drawerLeft}
            aria-label="Site menu"
            className="relative z-10 flex flex-col w-full max-w-[420px] h-full bg-surface text-ink shadow-2xl"
          >
            {/* Top bar: close + actions, then tabs */}
            <div className="bg-surface-muted border-b border-line px-6 pt-6 sm:px-8">
              <div className="flex items-center justify-between">
                <button ref={closeRef} type="button" onClick={onClose} aria-label="Close menu" className="btn-icon -ml-2">
                  <X className="w-5 h-5" strokeWidth={1.6} />
                </button>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={go(onSearch)} aria-label="Search" className="btn-icon">
                    <Search className="w-5 h-5" strokeWidth={1.6} />
                  </button>
                  <button
                    type="button"
                    onClick={go(onAccount)}
                    aria-label={currentUser ? `Sign out ${currentUser}` : "Sign in"}
                    className="btn-icon"
                  >
                    <User className="w-5 h-5" strokeWidth={1.6} />
                  </button>
                  <button type="button" onClick={go(onCart)} aria-label="View bag" className="btn-icon relative">
                    <ShoppingBag className="w-5 h-5" strokeWidth={1.6} />
                    {cartCount > 0 && (
                      <span className="absolute top-0.5 right-0 min-w-4 h-4 px-1 rounded-full bg-maroon-700 text-white text-2xs font-bold flex items-center justify-center leading-none">
                        {cartCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-5 flex gap-7 sm:gap-9" role="tablist" aria-label="Menu sections">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => selectTab(t.id)}
                    className={`relative pb-3 text-sm font-semibold uppercase tracking-[0.08em] transition-colors cursor-pointer ${
                      tab === t.id ? "text-ink" : "text-ink/60 hover:text-ink"
                    }`}
                  >
                    {t.label}
                    {tab === t.id && (
                      <motion.span
                        layoutId="nav-drawer-tab"
                        className="absolute left-0 right-0 bottom-2 h-0.5 bg-ink"
                        transition={MOTION_TRANSITION.fast}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Links for the selected tab, then the account / contact panel */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <AnimatePresence mode="wait" initial={false}>
                <motion.ul
                  key={tab}
                  role="tabpanel"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITION.fast }}
                  exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }}
                  className="px-6 sm:px-8 py-3"
                >
                  {renderLinks()}
                </motion.ul>
              </AnimatePresence>

              <div className="border-t-8 border-surface-muted bg-surface-muted/60 px-6 sm:px-8 py-6 space-y-1">
                <PanelLink icon={<User className="w-5 h-5" strokeWidth={1.4} />} onClick={go(onAccount)}>
                  {currentUser ? `Sign out (${currentUser})` : "Sign in"}
                </PanelLink>
                <PanelLink icon={<Inbox className="w-5 h-5" strokeWidth={1.4} />} onClick={go(onInbox)}>
                  Order updates
                  {unreadEmails > 0 && <span className="badge badge-sale ml-2">{unreadEmails}</span>}
                </PanelLink>
                <PanelLink icon={<MessageCircle className="w-5 h-5" strokeWidth={1.4} />} href={whatsappUrl}>
                  WhatsApp us
                </PanelLink>
                <PanelLink icon={<Mail className="w-5 h-5" strokeWidth={1.4} />} href={`mailto:${BOUTIQUE_CONFIG.supportEmail}`}>
                  Contact
                </PanelLink>
                <p className="flex items-center gap-4 pt-3 text-sm text-muted">
                  <MapPin className="w-5 h-5 shrink-0" strokeWidth={1.4} aria-hidden="true" />
                  Delivering across India
                </p>
              </div>
            </div>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ROW = "w-full flex items-center justify-between py-3.5 text-base text-left transition-colors cursor-pointer";

function MenuLink({ onClick, accent = false, children }: { onClick: () => void; accent?: boolean; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`${ROW} ${accent ? "text-maroon-600 hover:text-maroon-800" : "text-ink/85 hover:text-ink"}`}>
        {children}
      </button>
    </li>
  );
}

/** Row with a + that smoothly reveals its sub-links */
function ExpandableLink({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className={`${ROW} text-ink/85 hover:text-ink`}>
        {label}
        <Plus
          className={`w-4 h-4 shrink-0 transition-transform duration-300 ${open ? "rotate-45" : ""}`}
          strokeWidth={1.6}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: MOTION_TRANSITION.fast }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.25 } }}
            className="overflow-hidden pl-4 border-l border-line ml-1"
          >
            {children}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function SubLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full text-left py-2 text-sm text-muted hover:text-ink transition-colors cursor-pointer">
        {children}
      </button>
    </li>
  );
}

function PanelLink({
  icon,
  onClick,
  href,
  children,
}: {
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) {
  const className = "flex items-center gap-4 w-full py-2.5 text-base text-ink/85 hover:text-ink transition-colors cursor-pointer";
  const content = (
    <>
      <span className="shrink-0 text-ink/70" aria-hidden="true">
        {icon}
      </span>
      <span className="flex items-center">{children}</span>
    </>
  );
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
