import React, { Fragment, useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import ProductCatalog from "./components/ProductCatalog";
import CollectionPage from "./components/CollectionPage";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import CheckoutModal from "./components/CheckoutModal";
import ProductPage from "./components/ProductPage";
import QuickView from "./components/QuickView";
import InboxDrawer from "./components/InboxDrawer";
import LoginModal from "./components/LoginModal";
import AdminDashboard from "./components/AdminDashboard";

import { Product, CartItem, Order, CollectionType } from "./types";
import { productService } from "./services/productService";
import { orderService } from "./services/orderService";
import { BOUTIQUE_CONFIG } from "./config";
import { smoothScroll } from "./utils/smoothScroll";
import { getProductPath } from "./utils/productDisplay";
import { motion } from "motion/react";
import { MOTION_TRANSITION } from "./utils/motion";

type ViewState = "store" | "collection_alankritha" | "collection_ayanaa" | "product" | "admin";

// Product id from /product/:id (or the #/product/:id hash fallback), else null
const parseProductId = (path: string, hash: string): string | null => {
  const match = path.match(/^\/product\/([^/]+)/) || hash.match(/^#\/product\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export default function App() {
  // Navigation / View State
  const [currentView, setCurrentView] = useState<ViewState>("store");
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [currentCategory, setCurrentCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Storefront Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // Cart & Checkout State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | undefined>(undefined);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Modals & Drawers
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isInboxOpen, setIsInboxOpen] = useState<boolean>(false);
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  // Style to preselect when a collection page is opened from a style link (footer);
  // `id` changes on every request so the page re-mounts with that style
  const [collectionPreset, setCollectionPreset] = useState<{ style: string; id: number } | null>(null);

  // The very first page render is shown immediately (no fade), so content is never
  // hidden behind an animation on first load; later view changes fade in.
  const isFirstRender = useRef(true);
  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  // Load products & orders from repository
  const loadStorefrontData = () => {
    const activeProducts = productService.getProducts({ includeDisabled: false });
    const activeOrders = orderService.getOrders();
    setProducts(activeProducts);
    setOrders(activeOrders);
  };

  useEffect(() => {
    loadStorefrontData();
    smoothScroll.init();
    return () => {
      smoothScroll.destroy();
    };
  }, []);

  // Listen for URL routes and hash changes
  useEffect(() => {
    const handleRouteChange = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const productId = parseProductId(path, hash);
      setCurrentProductId(productId);
      setCollectionPreset(null);

      if (productId) {
        setCurrentView("product");
      } else if (path.startsWith("/admin") || hash.startsWith("#/admin") || hash.startsWith("#admin")) {
        setCurrentView("admin");
      } else if (path.includes("/collection/alankritha") || hash.includes("alankritha")) {
        setCurrentView("collection_alankritha");
      } else if (path.includes("/collection/ayanaa") || hash.includes("ayanaa")) {
        setCurrentView("collection_ayanaa");
      } else {
        setCurrentView("store");
      }
    };

    handleRouteChange();
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
  }, []);

  // Programmatic navigation helper
  const navigateTo = (view: ViewState, productId?: string) => {
    setCurrentView(view);
    setCurrentProductId(view === "product" ? productId ?? null : null);
    setQuickViewProduct(null);
    setCollectionPreset(null);
    smoothScroll.scrollToTop();

    if (view === "product" && productId) {
      window.history.pushState({}, "", getProductPath(productId));
    } else if (view === "admin") {
      window.history.pushState({}, "", "/admin");
    } else if (view === "collection_alankritha") {
      window.history.pushState({}, "", "/collection/alankritha");
    } else if (view === "collection_ayanaa") {
      window.history.pushState({}, "", "/collection/ayanaa");
    } else {
      window.history.pushState({}, "", "/");
      setCurrentCategory("All");
      setSearchQuery("");
    }
  };

  // Product navigation: cards open the full product page; the eye icon opens quick view
  const openProduct = (product: Pick<Product, "id">) => navigateTo("product", product.id);
  const openQuickView = (product: Pick<Product, "id">) => {
    // Always preview the live record (Hero's curated cards hold a static copy)
    const live = products.find((p) => p.id === product.id);
    if (live) setQuickViewProduct(live);
  };
  const navigateToCollection = (col: CollectionType) =>
    navigateTo(col === "alankritha" ? "collection_alankritha" : "collection_ayanaa");

  // Open a collection page with one of its styles (e.g. "A-Line") already selected
  const navigateToCollectionStyle = (col: CollectionType, style: string) => {
    navigateToCollection(col);
    setCollectionPreset({ style, id: Date.now() });
  };

  // Show a storefront edit or category on the homepage catalogue and scroll to it
  const shopCategory = (cat: string) => {
    if (currentView !== "store") {
      navigateTo("store");
    }
    setCurrentCategory(cat);
    setSearchQuery("");
    setTimeout(() => {
      smoothScroll.scrollToElement(document.getElementById("product-catalog-section"));
    }, 150);
  };

  // Site footer. `beforeNavigate` runs first when a footer link is used, e.g. to close
  // the sign-in page that also shows the footer.
  const renderFooter = (beforeNavigate: () => void = () => {}) => (
    <Footer
      onSelectCategory={(cat) => {
        beforeNavigate();
        shopCategory(cat);
      }}
      onNavigateCollection={(col) => {
        beforeNavigate();
        navigateTo(col === "alankritha" ? "collection_alankritha" : "collection_ayanaa");
      }}
      onNavigateCollectionStyle={(col, style) => {
        beforeNavigate();
        navigateToCollectionStyle(col, style);
      }}
    />
  );

  const handleReturnToStore = () => {
    navigateTo("store");
    loadStorefrontData();
  };

  // Supported Categories for Quick Filter (Strictly Kurtas and Sarees)
  const categoriesList = ["All", "Kurtas", "Sarees"];

  // Total items in cart
  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Add item to cart with size availability validation
  const handleAddToCart = (product: Product, size: string, quantity: number) => {
    const sizeStockMax = product.sizeStock ? (product.sizeStock[size] || 0) : 0;
    if (sizeStockMax <= 0) return;

    setCart((prevCart) => {
      const existingIdx = prevCart.findIndex(
        (item) => item.product.id === product.id && item.selectedSize === size
      );
      if (existingIdx > -1) {
        const updated = [...prevCart];
        const newQty = Math.min(sizeStockMax, updated[existingIdx].quantity + quantity);
        updated[existingIdx].quantity = newQty;
        return updated;
      } else {
        return [...prevCart, { product, selectedSize: size, quantity: Math.min(sizeStockMax, quantity) }];
      }
    });

    setIsCartOpen(true);
  };

  // Update cart item quantity
  const handleUpdateCartQuantity = (productId: string, size: string, quantity: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const sizeStockMax = product.sizeStock ? (product.sizeStock[size] || 0) : 0;

    setCart((prevCart) => {
      const idx = prevCart.findIndex(
        (item) => item.product.id === productId && item.selectedSize === size
      );
      if (idx === -1) return prevCart;
      const updated = [...prevCart];
      const boundedQuantity = Math.min(sizeStockMax, Math.max(1, quantity));
      updated[idx].quantity = boundedQuantity;
      return updated;
    });
  };

  // Remove item from cart
  const handleRemoveFromCart = (productId: string, size: string) => {
    setCart((prevCart) =>
      prevCart.filter(
        (item) => !(item.product.id === productId && item.selectedSize === size)
      )
    );
  };

  // Review submission
  const handleNewReview = (updatedProduct: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
  };

  // Buy Now: add to cart and go straight to checkout
  const handleBuyNow = (product: Product, size: string, quantity: number) => {
    handleAddToCart(product, size, quantity);
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  // Order success callback
  const handleOrderSuccess = (order: Order, updatedProducts: Product[]) => {
    setCart([]);
    setProducts(updatedProducts.filter(p => p.status === "enabled"));
    setOrders((prev) => [order, ...prev]);
    setUnreadCount((prev) => prev + 1);
    setAppliedPromoCode(undefined);
    setDiscountAmount(0);
  };

  const handleOpenInbox = () => {
    setIsInboxOpen(true);
    setUnreadCount(0);
  };

  // -------------------------------------------------------------
  // VIEW: ADMIN DASHBOARD (/admin)
  // -------------------------------------------------------------
  if (currentView === "admin") {
    return (
      <AdminDashboard
        onReturnToStore={handleReturnToStore}
        onProductsChanged={loadStorefrontData}
      />
    );
  }

  // -------------------------------------------------------------
  // CUSTOMER-FACING STOREFRONT (ANVAYA)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between select-none font-sans">
      
      {/* Top Header */}
      <Header
        currentCategory={currentCategory}
        setCategory={(cat) => {
          if (currentView !== "store") {
            navigateTo("store");
          }
          setCurrentCategory(cat);
          setSearchQuery("");
        }}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        cartCount={totalCartCount}
        toggleCart={() => setIsCartOpen(!isCartOpen)}
        toggleInbox={handleOpenInbox}
        toggleLogin={() => setIsLoginOpen(true)}
        unreadEmails={unreadCount}
        categories={categoriesList}
        currentUser={currentUser}
        onLogout={() => setCurrentUser(null)}
        onNavigateCollection={(col) => {
          navigateTo(col === "alankritha" ? "collection_alankritha" : "collection_ayanaa");
        }}
        onNavigateCollectionStyle={navigateToCollectionStyle}
        onShopCategory={shopCategory}
        onNavigateHome={() => navigateTo("store")}
        isHomepage={currentView === "store" && currentCategory === "All" && searchQuery === ""}
        onOpenProduct={openProduct}
        onQuickView={openQuickView}
      />

      {/* Each page view fades in gently when it changes; there is no exit animation,
          so navigation is never delayed */}
      <motion.main
        key={currentView === "product" ? `product-${currentProductId}` : currentView}
        className="flex-1"
        initial={isFirstRender.current ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITION.base }}
      >
        {/* VIEW A: DEDICATED ALANKRITHA COLLECTION PAGE (Kurtas only) */}
        {currentView === "collection_alankritha" && (
          <Fragment key={collectionPreset?.id ?? "alankritha"}>
          <CollectionPage
            initialSubcategory={collectionPreset?.style}
            collectionKey="alankritha"
            onProductClick={openProduct}
            onQuickView={openQuickView}
            onReturnHome={() => navigateTo("store")}
            onNavigateCollection={(col) => {
              navigateTo(col === "alankritha" ? "collection_alankritha" : "collection_ayanaa");
            }}
          />
          </Fragment>
        )}

        {/* VIEW B: DEDICATED AYANAA COLLECTION PAGE (Sarees only) */}
        {currentView === "collection_ayanaa" && (
          <Fragment key={collectionPreset?.id ?? "ayanaa"}>
          <CollectionPage
            initialSubcategory={collectionPreset?.style}
            collectionKey="ayanaa"
            onProductClick={openProduct}
            onQuickView={openQuickView}
            onReturnHome={() => navigateTo("store")}
            onNavigateCollection={(col) => {
              navigateTo(col === "alankritha" ? "collection_alankritha" : "collection_ayanaa");
            }}
          />
          </Fragment>
        )}

        {/* VIEW D: FULL PRODUCT DETAIL PAGE (/product/:id) */}
        {currentView === "product" && currentProductId && (
          <ProductPage
            productId={currentProductId}
            products={products}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onNewReview={handleNewReview}
            onOpenProduct={openProduct}
            onQuickView={openQuickView}
            onNavigateHome={() => navigateTo("store")}
            onNavigateCollection={navigateToCollection}
          />
        )}

        {/* VIEW C: MAIN ANVAYA HOMEPAGE */}
        {currentView === "store" && (
          <>
            {/* Banner Hero & Collection Cards */}
            {currentCategory === "All" && searchQuery === "" && (
              <Hero
                onExploreClick={() => {
                  smoothScroll.scrollToElement(document.getElementById("product-catalog-section"));
                }}
                onSelectCategory={(cat) => {
                  setCurrentCategory(cat);
                  setTimeout(() => {
                    smoothScroll.scrollToElement(document.getElementById("product-catalog-section"));
                  }, 100);
                }}
                onProductClick={openProduct}
                onQuickView={openQuickView}
                onNavigateCollection={(col) => {
                  navigateTo(col === "alankritha" ? "collection_alankritha" : "collection_ayanaa");
                }}
                onNavigateCollectionStyle={navigateToCollectionStyle}
              />
            )}

            {/* Product Catalogue Section with Filters, Search, Availability Indicators */}
            <ProductCatalog
              products={products}
              selectedCategory={currentCategory}
              searchQuery={searchQuery}
              onProductClick={openProduct}
              onQuickView={openQuickView}
              onSelectCategory={(cat) => setCurrentCategory(cat)}
            />
          </>
        )}
      </motion.main>

      {/* Footer */}
      {renderFooter()}

      {/* ====================================================
          OVERLAYS, MODALS AND DRAWERS
          ==================================================== */}

      {/* Product Quick View (eye icon on product cards) */}
      <QuickView
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onAddToCart={(product, size, quantity) => {
          setQuickViewProduct(null);
          handleAddToCart(product, size, quantity);
        }}
        onViewFullDetails={openProduct}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={(code, amt) => {
          setAppliedPromoCode(code);
          setDiscountAmount(amt || 0);
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cart}
        appliedPromoCode={appliedPromoCode}
        discountAmount={discountAmount}
        onOrderSuccess={handleOrderSuccess}
        onOpenInbox={handleOpenInbox}
      />

      {/* Client's Email Notifications Inbox Drawer */}
      <InboxDrawer
        isOpen={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        orders={orders}
        onMarkRead={() => {}}
      />

      {/* Customer Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onAdminLoginSuccess={() => {
          navigateTo("admin");
        }}
        onClientLoginSuccess={(user) => {
          setCurrentUser(user);
        }}
        footer={renderFooter(() => setIsLoginOpen(false))}
      />

    </div>
  );
}
