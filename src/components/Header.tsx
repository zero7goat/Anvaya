import React, { useState, useEffect } from "react";
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
  toggleInbox: () => void;
  toggleLogin: () => void;
  unreadEmails: number;
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

export default function Header({
  currentCategory,
  setCategory,
  searchQuery,
  setSearchQuery,
  cartCount,
  toggleCart,
  toggleInbox,
  toggleLogin,
  unreadEmails,
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
        <span>
          Handcrafted Kurtas &amp; Sarees
          <span className="hidden sm:inline">
            {" "}· Free Shipping Above ₹{BOUTIQUE_CONFIG.freeShippingThreshold.toLocaleString("en-IN")}
          </span>
        </span>
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
          <div className="flex items-center justify-between h-14 sm:h-16">
            
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
                  className="h-7 sm:h-8 md:h-9 w-auto object-contain brightness-105"
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
                  <span className="absolute top-0.5 right-0 min-w-4 h-4 px-1 rounded-full bg-gold-500 text-maroon-950 text-2xs font-bold flex items-center justify-center leading-none">
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
        unreadEmails={unreadEmails}
        currentUser={currentUser}
        onSearch={() => setIsSearchOpen(true)}
        onAccount={currentUser ? onLogout : toggleLogin}
        onCart={toggleCart}
        onInbox={toggleInbox}
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
