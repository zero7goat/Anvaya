import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MOTION_TRANSITION } from "../utils/motion";
import { Search, ShoppingCart, User, Menu } from "lucide-react";
import { BOUTIQUE_CONFIG } from "../config";
import { CollectionType, Product } from "../types";
import SearchOverlay from "./SearchOverlay";
import NavigationDrawer from "./NavigationDrawer";

interface HeaderProps {
  currentCategory: string;
  setCategory: (category: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  cartCount: number;
  toggleCart: () => void;
  toggleLogin: () => void;
  categories: string[];
  currentUser: string | null;
  onLogout: () => void;
  onNavigateCollection?: (collection: CollectionType) => void;
  onNavigateCollectionStyle?: (collection: CollectionType, style: string) => void;
  // Show a storefront edit (e.g. "New Arrivals") and scroll to it
  onShopCategory?: (category: string) => void;
  onNavigateHome?: () => void;
  isHomepage?: boolean;
  onOpenProduct?: (product: Product) => void;
  onQuickView?: (product: Product) => void;
}

// The top strip takes turns showing the shop's service terms (all from BOUTIQUE_CONFIG)
const ANNOUNCEMENTS = [
  "Handcrafted Kurtas & Sarees",
  "Free shipping across India",
  BOUTIQUE_CONFIG.onlinePayment.enabled ? "Pay securely online: UPI, cards, net banking" : "Order easily on WhatsApp",
];
const ANNOUNCEMENT_MS = 4500;

export default function Header({
  currentCategory,
  setCategory,
  searchQuery,
  setSearchQuery,
  cartCount,
  toggleCart,
  toggleLogin,
  categories,
  currentUser,
  onLogout,
  onNavigateCollection,
  onNavigateCollectionStyle,
  onShopCategory,
  onNavigateHome,
  isHomepage = true,
  onOpenProduct,
  onQuickView,
}: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [announcement, setAnnouncement] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setAnnouncement((i) => (i + 1) % ANNOUNCEMENTS.length), ANNOUNCEMENT_MS);
    return () => clearInterval(timer);
  }, []);

  // The bag count bounces when something is added
  const [bagBump, setBagBump] = useState(0);
  const previousCount = useRef(cartCount);
  useEffect(() => {
    if (cartCount > previousCount.current) setBagBump((n) => n + 1);
    previousCount.current = cartCount;
  }, [cartCount]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleBrandClick = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      setCategory("All");
      setSearchQuery("");
    }
  };

  const handleCollectionSelect = (col: CollectionType) => {
    if (onNavigateCollection) {
      onNavigateCollection(col);
    } else {
      setCategory(col === "alankritha" ? "Kurtas" : "Sarees");
    }
  };

  // Determine navbar styling:
  // When at top of homepage, overlay cleanly with soft gradient matching the reference screenshot.
  // When scrolled or on subpages, solid luxury dark burgundy background.
  const isTransparent = isHomepage && !isScrolled;

  return (
    <header className="sticky top-0 z-40 w-full" id="anvaya-header">
      {/* 1. TOP ANNOUNCEMENT STRIP */}
      <div
        className="w-full bg-gold-300 text-maroon-950 py-1 px-4 text-center tracking-[0.2em] uppercase font-semibold text-2xs sm:text-xs flex items-center justify-center select-none"
        id="top-announcement-strip"
      >
        {/* One message at a time, fading up into place (all are read once by screen readers) */}
        <span className="relative h-4 sm:h-[1.15rem] w-full overflow-hidden" aria-hidden="true">
          <AnimatePresence initial={false}>
            <motion.span
              key={announcement}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITION.base }}
              exit={{ opacity: 0, y: -10, transition: MOTION_TRANSITION.fast }}
              className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
            >
              {ANNOUNCEMENTS[announcement]}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="sr-only">{ANNOUNCEMENTS.join(". ")}</span>
      </div>

      {/* 2. MAIN NAVIGATION BAR: Exact match to reference screenshot */}
      <div 
        className={`w-full transition-colors duration-500 ${
          isTransparent 
            ? "bg-gradient-to-b from-black/85 via-black/45 to-transparent backdrop-blur-[1px]" 
            : "bg-maroon-950/95 backdrop-blur-md border-b border-white/10 shadow-md"
        }`}
      >
        <div className="container-page">
          <div className={`flex items-center justify-between transition-[height] duration-500 ${isScrolled ? "h-12 sm:h-14" : "h-14 sm:h-16"}`}>
            
            {/* Left Zone: Hamburger Menu & ANVAYA Logo (Emblem + Wordmark) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Hamburger Menu Icon */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="-ml-2.5 p-2.5 text-white hover:text-gold-300 transition-colors cursor-pointer"
                aria-label="Open navigation menu"
                id="menu-trigger-btn"
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8]" />
              </button>

              {/* ANVAYA Logo: Emblem (Logo.png) + Serif Brand Wordmark */}
              <button
                onClick={handleBrandClick}
                className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group text-left select-none"
                id="brand-logo-btn"
                title="ANVAYA - Handcrafted Indian Ethnic Wear"
              >
                {/* Emblem from Logo.png in images folder */}
                <img
                  src="/images/logo-144.png" width={159} height={144}
                  alt="ANVAYA Motif"
                  className={`w-auto object-contain brightness-105 transition-[height] duration-500 ${isScrolled ? "h-6 sm:h-7 md:h-8" : "h-7 sm:h-8 md:h-9"}`}
                  loading="eager"
                  decoding="async"
                />
                
                {/* ANVAYA Serif Typography */}
                <span className="font-serif text-lg sm:text-xl md:text-2xl font-normal tracking-[0.22em] text-canvas uppercase">
                  {BOUTIQUE_CONFIG.brandName}
                </span>
              </button>
            </div>

            {/* Right Zone: Search, Shopping Cart, User Profile */}
            <div className="flex items-center -mr-2.5 sm:gap-2 shrink-0" id="header-right-actions">
              
              {/* Search Toggle Icon */}
              <button
                onClick={() => setIsSearchOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isSearchOpen}
                className="p-2.5 text-white hover:text-gold-300 transition-colors cursor-pointer"
                title="Search Kurtas & Sarees"
                aria-label="Search"
                id="header-search-btn"
              >
                <Search className="w-5 h-5 stroke-[1.8]" />
              </button>

              {/* Shopping Cart Icon */}
              <button
                onClick={toggleCart}
                className="relative p-2.5 text-white hover:text-gold-300 transition-colors cursor-pointer flex items-center"
                title="Shopping Bag"
                aria-label="View Cart"
                id="header-cart-btn"
              >
                <ShoppingCart className="w-5 h-5 stroke-[1.8]" />
                {cartCount > 0 && (
                  <span
                    key={bagBump}
                    className={`absolute top-0.5 right-0 min-w-4 h-4 px-1 rounded-full bg-gold-500 text-maroon-950 text-2xs font-bold flex items-center justify-center leading-none ${bagBump ? "bag-bump" : ""}`}
                  >
                    {cartCount}
                  </span>
                )}
              </button>

              {/* User Profile / Account Icon */}
              <button
                onClick={currentUser ? onLogout : toggleLogin}
                className="relative p-2.5 text-white hover:text-gold-300 transition-colors cursor-pointer"
                title={currentUser ? `Signed in as ${currentUser}` : "Account"}
                aria-label="User Account"
                id="header-user-btn"
              >
                <User className="w-5 h-5 stroke-[1.8]" />
                {currentUser && (
                  <span className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-success ring-2 ring-maroon-950" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen product search (outside the blurred bar so it can cover the viewport) */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onOpenProduct={(product) => onOpenProduct?.(product)}
        onQuickView={(product) => onQuickView?.(product)}
      />

      {/* 3. SLIDE-OUT SITE MENU: opens from the left on hamburger click */}
      <NavigationDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        cartCount={cartCount}
        currentUser={currentUser}
        onSearch={() => setIsSearchOpen(true)}
        onAccount={currentUser ? onLogout : toggleLogin}
        onCart={toggleCart}
        onHome={handleBrandClick}
        onShopCategory={onShopCategory ?? setCategory}
        onNavigateCollection={handleCollectionSelect}
        onNavigateCollectionStyle={(col, style) =>
          onNavigateCollectionStyle ? onNavigateCollectionStyle(col, style) : handleCollectionSelect(col)
        }
      />
    </header>
  );
}
