import { Fragment, Suspense, lazy, useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import ProductCatalog from "./components/ProductCatalog";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import { CartActionsContext } from "./context/CartActionsContext";

import { Product, CartItem, Order, CollectionType } from "./types";
import { productService } from "./services/productService";
import { BOUTIQUE_CONFIG } from "./config";
import { smoothScroll } from "./utils/smoothScroll";
import { getProductPath } from "./utils/productDisplay";
import { motion } from "motion/react";
import { MOTION_TRANSITION } from "./utils/motion";
import {
  StoredCartLine,
  addCartItem,
  reconcileCart,
  removeCartItem,
  sameCart,
  setCartItemQuantity,
  toStoredCart,
} from "./utils/cart";
import { loadSavedCoupon, saveCoupon } from "./utils/savedCoupon";
import { resolveRoute, type ViewState } from "./utils/routes";
import NotFoundPage from "./components/NotFoundPage";

// Screens most visitors never open load on first use, keeping the first page light
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const CheckoutModal = lazy(() => import("./components/CheckoutModal"));
const InboxDrawer = lazy(() => import("./components/InboxDrawer"));
const LoginModal = lazy(() => import("./components/LoginModal"));
// Collection and product pages, and Quick View, load when first shown
const CollectionPage = lazy(() => import("./components/CollectionPage"));
const ProductPage = lazy(() => import("./components/ProductPage"));
const QuickView = lazy(() => import("./components/QuickView"));

// The cart survives a refresh: only product IDs, sizes and quantities are kept, and
// they are re-checked against the live catalogue (price, stock) when read back.
const CART_STORAGE_KEY = "anvaya_cart";
const readStoredCart = (): StoredCartLine[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const writeStoredCart = (lines: StoredCartLine[]) => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage blocked (private mode): the cart still works for this visit
  }
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
  // Only the code is passed on: checkout recalculates the discount for the cart it shows
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | undefined>(undefined);
  // The code applied in the bag, kept across reloads (see utils/savedCoupon.ts)
  const [bagCouponCode, setBagCouponCode] = useState<string | undefined>(loadSavedCoupon);
  useEffect(() => saveCoupon(bagCouponCode), [bagCouponCode]);
  const cartHydrated = useRef(false);
  // Orders placed in this browser during this visit (shown under "Order updates")
  const [myOrderIds, setMyOrderIds] = useState<string[]>([]);
  // Lazily loaded overlays stay mounted once opened, so their state and exit animations survive
  const [loadedOverlays, setLoadedOverlays] = useState({ checkout: false, inbox: false, login: false });

  // Modals & Drawers
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  // Quick View loads the first time it is opened, then stays mounted (like the overlays above)
  const [quickViewLoaded, setQuickViewLoaded] = useState(false);
  useEffect(() => {
    if (quickViewProduct) setQuickViewLoaded(true);
  }, [quickViewProduct]);
  const [isInboxOpen, setIsInboxOpen] = useState<boolean>(false);
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  // Style to preselect when a collection page is opened from a style link (footer);
  // `id` changes on every request so the page re-mounts with that style
  const [collectionPreset, setCollectionPreset] = useState<{ style: string; id: number } | null>(null);
  // When Supabase is configured the site waits for its catalogue (or the fallback) before showing prices
  const [catalogueReady, setCatalogueReady] = useState(() => !productService.usesRemoteCatalogue());

  // The very first page render is shown immediately (no fade), so content is never
  // hidden behind an animation on first load; later view changes fade in.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (catalogueReady) isFirstRender.current = false;
  }, [catalogueReady]);

  // Load the products currently held by the catalogue service
  const loadStorefrontData = () => {
    const activeProducts = productService.getProducts({ includeDisabled: false });
    setProducts(activeProducts);
  };

  // Keep the cart in step with the live catalogue: restore the saved cart once the
  // products are known, then re-check prices and stock whenever products change
  useEffect(() => {
    if (products.length === 0) return;
    setCart((prev) => {
      const lines = cartHydrated.current ? toStoredCart(prev) : readStoredCart();
      cartHydrated.current = true;
      const next = reconcileCart(lines, products);
      return sameCart(prev, next) ? prev : next;
    });
  }, [products]);

  useEffect(() => {
    if (cartHydrated.current) writeStoredCart(toStoredCart(cart));
  }, [cart]);

  useEffect(() => {
    if (isCheckoutOpen || isInboxOpen || isLoginOpen) {
      setLoadedOverlays((prev) => ({
        checkout: prev.checkout || isCheckoutOpen,
        inbox: prev.inbox || isInboxOpen,
        login: prev.login || isLoginOpen,
      }));
    }
  }, [isCheckoutOpen, isInboxOpen, isLoginOpen]);

  useEffect(() => {
    let active = true;
    productService.loadCatalogue().then(() => {
      if (!active) return;
      loadStorefrontData();
      setCatalogueReady(true);
    });
    smoothScroll.init();
    return () => {
      active = false;
      smoothScroll.destroy();
    };
  }, []);

  // Listen for URL routes and hash changes
  useEffect(() => {
    const handleRouteChange = () => {
      const route = resolveRoute(window.location.pathname, window.location.hash);
      setCurrentProductId(route.productId);
      setCollectionPreset(null);
      setCurrentView(route.view);
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

  // Add item to cart (capped at the stock left in that size)
  const handleAddToCart = (product: Product, size: string, quantity: number) => {
    if ((product.sizeStock?.[size] || 0) <= 0) return;
    setCart((prevCart) => addCartItem(prevCart, product, size, quantity));
    setIsCartOpen(true);
  };

  // Update cart item quantity, checked against the live product's stock
  const handleUpdateCartQuantity = (productId: string, size: string, quantity: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setCart((prevCart) => setCartItemQuantity(prevCart, product, size, quantity));
  };

  // Remove item from cart
  const handleRemoveFromCart = (productId: string, size: string) => {
    setCart((prevCart) => removeCartItem(prevCart, productId, size));
  };

  // Review submission
  // Buy Now: add to cart and go straight to checkout
  const handleBuyNow = (product: Product, size: string, quantity: number) => {
    handleAddToCart(product, size, quantity);
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  // Called once the database has saved an order: the bag is emptied, and the catalogue is
  // read again so the storefront shows the stock the order reserved
  const handleOrderSuccess = (order: Order) => {
    setCart([]);
    productService.reloadCatalogue().then((reloaded) => {
      if (reloaded) loadStorefrontData();
    });
    setOrders((prev) => [order, ...prev]);
    setMyOrderIds((prev) => [order.id, ...prev]);
    setUnreadCount((prev) => prev + 1);
    setAppliedPromoCode(undefined);
    setBagCouponCode(undefined);
  };

  const handleOpenInbox = () => {
    setIsInboxOpen(true);
    setUnreadCount(0);
  };

  // -------------------------------------------------------------
  // VIEW: ADMIN DASHBOARD (/admin)
  // -------------------------------------------------------------
  if (!catalogueReady) return <PageLoading />;

  if (currentView === "admin") {
    return (
      <Suspense fallback={<PageLoading />}>
        <AdminDashboard
          onReturnToStore={handleReturnToStore}
          onProductsChanged={loadStorefrontData}
        />
      </Suspense>
    );
  }

  // -------------------------------------------------------------
  // CUSTOMER-FACING STOREFRONT (ANVAYA)
  // -------------------------------------------------------------
  return (
    <CartActionsContext.Provider value={{ addToCart: handleAddToCart }}>
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between font-sans">
      
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
        <Suspense fallback={<PageLoading />}>
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
            onOpenProduct={openProduct}
            onQuickView={openQuickView}
            onNavigateHome={() => navigateTo("store")}
            onNavigateCollection={navigateToCollection}
          />
        )}
        </Suspense>

        {/* VIEW E: UNKNOWN ADDRESS (404) */}
        {currentView === "not_found" && (
          <NotFoundPage
            id="page-not-found"
            eyebrow="Page not found"
            title="We couldn't find that page"
            message="The link may be mistyped or out of date. Explore our collections, or head back to the homepage."
            documentTitle={`Page not found | ${BOUTIQUE_CONFIG.brandName}`}
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
      {quickViewLoaded && (
        <Suspense fallback={null}>
          <QuickView
            product={quickViewProduct}
            onClose={() => setQuickViewProduct(null)}
            onAddToCart={(product, size, quantity) => {
              setQuickViewProduct(null);
              handleAddToCart(product, size, quantity);
            }}
            onViewFullDetails={openProduct}
          />
        </Suspense>
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        couponCode={bagCouponCode}
        onCouponChange={setBagCouponCode}
        onCheckout={(code) => {
          setAppliedPromoCode(code);
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout, order updates and sign-in load the first time they are opened */}
      <Suspense fallback={null}>
        {loadedOverlays.checkout && (
          <CheckoutModal
            isOpen={isCheckoutOpen}
            onClose={() => setIsCheckoutOpen(false)}
            cartItems={cart}
            appliedPromoCode={appliedPromoCode}
            onOrderSuccess={handleOrderSuccess}
            onOpenInbox={handleOpenInbox}
            onCatalogueChanged={() => {
              productService.reloadCatalogue().then((reloaded) => {
                if (reloaded) loadStorefrontData();
              });
            }}
          />
        )}

        {/* The shopper's own orders from this visit (never other customers' orders) */}
        {loadedOverlays.inbox && (
          <InboxDrawer
            isOpen={isInboxOpen}
            onClose={() => setIsInboxOpen(false)}
            orders={orders.filter((o) => myOrderIds.includes(o.id))}
          />
        )}

        {loadedOverlays.login && (
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
        )}
      </Suspense>

    </div>
    </CartActionsContext.Provider>
  );
}

// Shown while a lazily loaded page (admin, collection or product page) downloads
function PageLoading() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center" role="status" aria-live="polite">
      <span className="text-sm text-muted">Loading…</span>
    </div>
  );
}
