import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronRight, Clock, Mail, MapPin, MessageCircle, Plus, Search, ShoppingBag, User, X } from "lucide-react";
import { MOTION_TRANSITION, OVERLAY_MOTION } from "../utils/motion";
import { BOUTIQUE_CONFIG } from "../config";
import { CollectionType } from "../types";
import { COLLECTION_STYLES } from "./Footer";
import { productService } from "../services/productService";
import { SITE_IMAGES, getProductImage } from "../data/imageRegistry";
import ProductImage from "./ProductImage";

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartCount: number;
  currentUser: string | null;
  onSearch: () => void;
  onAccount: () => void;
  onCart: () => void;
  onHome: () => void;
  onShopCategory: (category: string) => void;
  onNavigateCollection: (collection: CollectionType) => void;
  onNavigateCollectionStyle: (collection: CollectionType, style: string) => void;
}

type Tab = "home" | CollectionType;
const TABS: Tab[] = ["home", "alankritha", "ayanaa"];

// A collection's cover: its own cover photo, else its newest piece with a photo
const collectionCover = (col: CollectionType) => {
  if (SITE_IMAGES.collectionCovers[col]) return SITE_IMAGES.collectionCovers[col];
  const withPhoto = productService.getProducts({ collection: col, sortBy: "newest" }).find((p) => getProductImage(p));
  return withPhoto ? getProductImage(withPhoto) : "";
};

/**
 * Left slide-in site menu (hamburger). A brand header with close, search, account and bag;
 * a Home / Alankritha / Ayanaa switch; the links for that tab; and a contact panel.
 *
 * All three tab panels sit in the same grid cell and cross-fade, so switching tabs never
 * changes the height of the menu or moves the panel below. The bag opens on top of the menu
 * (the menu stays open behind it); every other action closes the menu.
 */
export default function NavigationDrawer({
  isOpen,
  onClose,
  cartCount,
  currentUser,
  onSearch,
  onAccount,
  onCart,
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

  // Focus the close button on open, close on Escape (unless a window opened on top of the
  // menu, such as the bag, is the one being closed), return focus to the trigger on close
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClose();
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

  const tabLabel = (t: Tab) => (t === "home" ? "Home" : collections[t].name);

  const homeLinks = (
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

  // A collection tab: cover, tagline and its styles (only those with pieces), then "shop all"
  const collectionLinks = (col: CollectionType) => {
    const info = collections[col];
    const cover = collectionCover(col);
    const styles = COLLECTION_STYLES[col]
      .map((style) => ({ style, count: productService.getProducts({ collection: col, subcategory: style }).length }))
      .filter((s) => s.count > 0);
    return (
      <>
        <li className="mb-3">
          <button type="button" onClick={go(() => onNavigateCollection(col))} className="group relative block w-full overflow-hidden rounded-sm text-left cursor-pointer">
            <div className="aspect-[16/9] bg-maroon-900">
              {cover && <ProductImage src={cover} alt="" className="w-full h-full object-cover object-top opacity-80" sizes="380px" />}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-maroon-950/85 via-maroon-950/20 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-white">
              <p className="font-serif text-xl">{info.name}</p>
              <p className="text-xs text-white/80 mt-0.5">{info.tagline}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-gold-300">
                Shop the collection <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </div>
          </button>
        </li>
        {styles.map(({ style, count }) => (
          <Fragment key={style}>
            <MenuLink onClick={go(() => onNavigateCollectionStyle(col, style))} meta={`${count} ${count === 1 ? "piece" : "pieces"}`}>
              {style} {info.category}
            </MenuLink>
          </Fragment>
        ))}
        <MenuLink onClick={go(() => onNavigateCollection(col))} accent>
          All {info.name} {info.category}
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
            className="relative z-10 flex flex-col w-full max-w-[400px] h-full bg-canvas text-ink shadow-2xl"
          >
            {/* Brand header: emblem and name, close, then search / account / bag */}
            <div className="bg-maroon-950 text-white px-5 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img src="/images/logo-144.png" width={159} height={144} alt="" className="h-8 w-auto object-contain" decoding="async" />
                  <span className="font-serif text-lg tracking-[0.22em] uppercase">{BOUTIQUE_CONFIG.brandName}</span>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  className="btn-icon -mr-2 !text-white/80 hover:!text-white hover:!bg-white/10"
                >
                  <X className="w-5 h-5" strokeWidth={1.6} />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <HeaderAction icon={<Search className="w-4 h-4" strokeWidth={1.7} />} label="Search" onClick={go(onSearch)} />
                <HeaderAction
                  icon={<User className="w-4 h-4" strokeWidth={1.7} />}
                  label={currentUser ? "Sign out" : "Account"}
                  onClick={go(onAccount)}
                />
                {/* The bag opens on top; the menu stays open behind it */}
                <HeaderAction
                  icon={<ShoppingBag className="w-4 h-4" strokeWidth={1.7} />}
                  label="Bag"
                  onClick={onCart}
                  badge={cartCount > 0 ? cartCount : undefined}
                />
              </div>
            </div>

            {/* Home / collection switch: a pill slides behind the chosen tab */}
            <div className="px-5 sm:px-6 pt-4 pb-2 bg-canvas">
              <div className="grid grid-cols-3 p-1 rounded-full bg-surface-muted border border-line" role="tablist" aria-label="Menu sections">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    id={`nav-tab-${t}`}
                    aria-selected={tab === t}
                    aria-controls={`nav-panel-${t}`}
                    onClick={() => selectTab(t)}
                    className={`relative py-2 rounded-full text-xs font-semibold uppercase tracking-[0.1em] transition-colors cursor-pointer ${
                      tab === t ? "text-white" : "text-ink/65 hover:text-ink"
                    }`}
                  >
                    {tab === t && (
                      <motion.span
                        layoutId="nav-drawer-tab"
                        className="absolute inset-0 rounded-full bg-maroon-800 shadow-sm"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative">{tabLabel(t)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Links for each tab, all in one grid cell so the menu keeps its height; then contact */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="grid px-5 sm:px-6 pt-2 pb-4">
                {TABS.map((t) => {
                  const active = tab === t;
                  return (
                    <ul
                      key={t}
                      id={`nav-panel-${t}`}
                      role="tabpanel"
                      aria-labelledby={`nav-tab-${t}`}
                      aria-hidden={!active}
                      inert={!active}
                      className={`[grid-area:1/1] transition-[opacity,transform] duration-300 ease-out ${
                        active ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none translate-x-2"
                      }`}
                    >
                      {t === "home" ? homeLinks : collectionLinks(t)}
                    </ul>
                  );
                })}
              </div>

              <div className="mx-5 sm:mx-6 mb-6 rounded-sm bg-surface border border-line p-4 space-y-1">
                <p className="eyebrow text-ink mb-2">Need help?</p>
                <PanelLink icon={<MessageCircle className="w-4 h-4" strokeWidth={1.6} />} href={whatsappUrl}>
                  WhatsApp us
                </PanelLink>
                {BOUTIQUE_CONFIG.supportEmail && (
                  <PanelLink icon={<Mail className="w-4 h-4" strokeWidth={1.6} />} href={`mailto:${BOUTIQUE_CONFIG.supportEmail}`}>
                    {BOUTIQUE_CONFIG.supportEmail}
                  </PanelLink>
                )}
                <p className="flex items-center gap-3 pt-1 text-xs text-muted">
                  <Clock className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  {BOUTIQUE_CONFIG.supportHours}
                </p>
                <p className="flex items-center gap-3 text-xs text-muted">
                  <MapPin className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  Free delivery across India
                </p>
              </div>
            </div>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One of the three header buttons (search, account, bag) */
function HeaderAction({ icon, label, onClick, badge }: { icon: ReactNode; label: string; onClick: () => void; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex items-center justify-center gap-2 h-10 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="min-w-4 h-4 px-1 rounded-full bg-gold-500 text-maroon-950 text-2xs font-bold flex items-center justify-center leading-none tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

const ROW =
  "group w-full flex items-center justify-between gap-3 py-3.5 px-2 -mx-2 rounded-xs text-[0.95rem] text-left border-b border-line/70 transition-colors cursor-pointer hover:bg-surface-muted";

function MenuLink({
  onClick,
  accent = false,
  meta,
  children,
}: {
  onClick: () => void;
  accent?: boolean;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`${ROW} ${accent ? "text-maroon-700 font-semibold" : "text-ink/90"}`}>
        <span>{children}</span>
        <span className="flex items-center gap-2 shrink-0 text-muted">
          {meta && <span className="text-2xs tabular-nums">{meta}</span>}
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.6} aria-hidden="true" />
        </span>
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
      <button type="button" onClick={onToggle} aria-expanded={open} className={`${ROW} text-ink/90`}>
        {label}
        <Plus
          className={`w-4 h-4 shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-45" : ""}`}
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
            className="overflow-hidden pl-4 border-l-2 border-gold-300 ml-1 my-1"
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
  const className = "flex items-center gap-3 w-full py-1.5 text-sm text-ink/85 hover:text-maroon-700 transition-colors cursor-pointer min-w-0";
  const content = (
    <>
      <span className="shrink-0 text-maroon-600" aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{children}</span>
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
