import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Package, ShoppingBag, AlertTriangle, CheckCircle2, Clock, 
  Search, Plus, Edit2, Trash2, Eye, EyeOff, LogOut, ArrowLeft, 
  Filter, Check, X, RefreshCw, Smartphone, ExternalLink,
  ChevronRight, Layers, DollarSign, Store, Menu, Bell, BellOff, Volume2, VolumeX
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { OVERLAY_MOTION } from "../utils/motion";
import { useOverlay } from "../hooks/useOverlay";
import { Product, Order, CollectionType } from "../types";
import { productService } from "../services/productService";
import { MAX_ORDERS, orderApi, nextPaymentStatus, nextStatuses, type OrderStatus, type PaymentStatus } from "../services/orderApi";
import { authService, AdminAuthState } from "../services/authService";
import { catalogueAdmin, SaveResult } from "../services/catalogueAdmin";
import {
  COLLECTION_STYLES, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, MAX_STOCK, checkProductForm, newProductId,
} from "../utils/productRules";
import { BOUTIQUE_CONFIG } from "../config";
import ProductImage from "./ProductImage";
import { FloralSprig } from "./decor/Motifs";
import { BOX_INPUT, DomeBorder, LabelledBox } from "./AuthFormParts";
import { getProductImage } from "../data/imageRegistry";
import { ALL_SIZES, FREE_SIZE, describeSize, getSizeOptions, getSizeOptionsFor } from "../utils/productDisplay";
import { filterInventory } from "../utils/inventorySearch";
import { useNewOrderAlerts, type NotificationState } from "../hooks/useNewOrderAlerts";
import { ORDER_POLL_MS } from "../services/orderAlerts";
import { ACCEPTED_IMAGE_TYPES, checkImageFile, compressImage, uploadProductImage } from "../services/imageUpload";

type AdminSection = "overview" | "products" | "inventory" | "orders";

interface AdminDashboardProps {
  onReturnToStore: () => void;
  onProductsChanged?: () => void;
}

export default function AdminDashboard({ onReturnToStore, onProductsChanged }: AdminDashboardProps) {
  // Authentication state (Supabase Auth; admin access is confirmed by the database)
  const [authState, setAuthState] = useState<AdminAuthState>(authService.getState());
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const unsubscribe = authService.subscribe(setAuthState);
    setAuthState(authService.getState());
    authService.init();
    return unsubscribe;
  }, []);

  // Dashboard active view
  const [activeTab, setActiveTab] = useState<AdminSection>("overview");
  // Section menu on screens narrower than the header tabs
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);

  // In-memory data states
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // Search & Filter states for products
  const [prodSearch, setProdSearch] = useState("");
  const [prodCategoryFilter, setProdCategoryFilter] = useState("All");
  const [prodCollectionFilter, setProdCollectionFilter] = useState<"All" | "alankritha" | "ayanaa">("All");
  const [prodStatusFilter, setProdStatusFilter] = useState<"All" | "enabled" | "disabled">("All");

  const [inventorySearch, setInventorySearch] = useState("");

  // Search & Filter states for orders
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("All");

  // Modal states: Add / Edit Product
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states for Product Modal
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    collection: "alankritha" as CollectionType,
    category: "Kurtas" as "Kurtas" | "Sarees",
    subcategory: "Straight Fit",
    price: "",
    salePrice: "",
    image: "",
    isFeatured: false,
    isNewArrival: true,
    status: "enabled" as "enabled" | "disabled",
    sizeStock: { "S": 4, "M": 6, "L": 6, "XL": 2, "XXL": 0 } as Record<string, number | string>
  });
  const [formError, setFormError] = useState("");
  // Id for the product being added, made once per form so a retried save can't add it twice
  const [newFormProductId, setNewFormProductId] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const savingProductRef = useRef(false);
  // A photo upload is in progress: the form can't be saved or closed until it finishes
  const [imageUploading, setImageUploading] = useState(false);

  // Delete Confirmation Dialog state
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Saves in progress (per product action), and the latest saved / failed message
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const pendingRef = useRef(new Set<string>());
  const [notice, setNotice] = useState<{ kind: "success" | "warning" | "error"; text: string } | null>(null);

  // Order Details Modal / View (by id, so it always shows the latest copy read from the database)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

  // Orders come from Supabase (public.orders, readable by admins only)
  const [ordersLoad, setOrdersLoad] = useState<
    { status: "loading" } | { status: "ready"; skipped: number } | { status: "error"; message: string }
  >({ status: "loading" });
  const ordersRequest = useRef(0);
  // Order whose status change is being saved (one at a time)
  const [orderBusy, setOrderBusy] = useState<string | null>(null);
  const orderBusyRef = useRef(false);

  // Load products from the catalogue service
  const refreshData = () => {
    const prods = productService.getProducts({ includeDisabled: true });
    setProducts(prods);
    if (onProductsChanged) onProductsChanged();
  };

  const loadOrders = async () => {
    const request = ++ordersRequest.current;
    setOrdersLoad((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    const result = await orderApi.listOrders();
    if (request !== ordersRequest.current) return;
    if (result.ok) {
      setOrders(result.orders);
      setOrdersLoad({ status: "ready", skipped: result.skipped });
    } else {
      setOrdersLoad({ status: "error", message: result.error });
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // New-order badge, tab title, sound and notifications (only while this page is open)
  const signedIn = authState.status === "admin";
  const orderAlerts = useNewOrderAlerts(orders, signedIn && ordersLoad.status === "ready", activeTab === "orders", signedIn);

  // While signed in, read the orders again every minute. A round is skipped while a status
  // change is being saved (that save reads the orders itself); the timer stops on sign-out
  // or when the dashboard is closed.
  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setInterval(() => {
      if (!orderBusyRef.current) void loadOrders();
    }, ORDER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [signedIn]);

  // Signed out: drop the orders (customer details) from memory, and ignore any read still
  // on its way, so the next sign-in starts from a fresh list
  useEffect(() => {
    if (signedIn) return;
    ordersRequest.current++;
    setOrders([]);
    setOrdersLoad({ status: "loading" });
    setSelectedOrderId(null);
  }, [signedIn]);

  // Once signed in, read the catalogue again as the admin, so hidden products are listed
  // too, and read the orders (which only admins can see)
  useEffect(() => {
    if (authState.status !== "admin") return;
    let active = true;
    productService.reloadCatalogue().then(() => {
      if (active) refreshData();
    });
    void loadOrders();
    return () => {
      active = false;
    };
  }, [authState.status]);

  // Success messages fade after a few seconds; errors stay until dismissed
  useEffect(() => {
    if (notice?.kind !== "success") return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // After a saved change: read the catalogue again so the dashboard and the shop show what was saved
  const showSaved = async (text: string) => {
    const reloaded = await productService.reloadCatalogue();
    refreshData();
    setNotice(
      reloaded
        ? { kind: "success", text }
        : { kind: "warning", text: `${text} The list couldn't be refreshed; reload the page to see the latest.` }
    );
  };

  // Runs one save for a product action, ignoring repeat clicks while it is in progress
  const runAction = async (key: string, action: () => Promise<SaveResult>, successText: string): Promise<boolean> => {
    if (pendingRef.current.has(key)) return false;
    pendingRef.current.add(key);
    setPending((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await action();
      if (result.ok) await showSaved(successText);
      else {
        setNotice({ kind: "error", text: result.error });
        // Refused because stock changed since it was loaded: show the live numbers
        if (result.stockChanged && (await productService.reloadCatalogue())) refreshData();
      }
      return result.ok;
    } finally {
      pendingRef.current.delete(key);
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Compute business analytics overview numbers
  const metrics = useMemo(() => {
    const totalCount = products.length;
    const inStockCount = products.filter(p => productService.isInStock(p)).length;
    const outOfStockCount = totalCount - inStockCount;
    const publishedCount = products.filter(p => p.status === "enabled").length;

    const kurtasCount = products.filter(p => p.category === "Kurtas").length;
    const sareesCount = products.filter(p => p.category === "Sarees").length;

    const totalOrdersCount = orders.length;
    const pendingOrdersCount = orders.filter(o => o.status === "Pending").length;
    const revenue = orders
      .filter(o => o.status !== "Cancelled" && o.status !== "Returned")
      .reduce((sum, o) => sum + o.total, 0);

    return {
      totalCount,
      inStockCount,
      outOfStockCount,
      publishedCount,
      kurtasCount,
      sareesCount,
      totalOrdersCount,
      pendingOrdersCount,
      revenue
    };
  }, [products, orders]);

  // Filtered products list for product management
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Category filter
      if (prodCategoryFilter !== "All" && p.category !== prodCategoryFilter) return false;
      // Collection filter
      if (prodCollectionFilter !== "All" && p.collection !== prodCollectionFilter) return false;
      // Status filter
      if (prodStatusFilter !== "All" && p.status !== prodStatusFilter) return false;
      // Search
      if (prodSearch.trim()) {
        const q = prodSearch.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.subcategory && p.subcategory.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [products, prodCategoryFilter, prodCollectionFilter, prodStatusFilter, prodSearch]);

  const inventoryProducts = useMemo(() => filterInventory(products, inventorySearch), [products, inventorySearch]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (orderStatusFilter !== "All" && o.status !== orderStatusFilter) return false;
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        return (
          o.reference.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.toLowerCase().includes(q) ||
          o.city.toLowerCase().includes(q) ||
          o.state.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, orderStatusFilter, orderSearch]);

  // Handle Admin Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    const res = await authService.signIn(loginEmail, loginPassword);
    setLoginLoading(false);
    if (res.ok) {
      setLoginPassword("");
      refreshData();
    } else {
      setLoginError(res.error ?? "Sign-in failed. Please try again.");
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    setSigningOut(true);
    await authService.signOut();
    setSigningOut(false);
    setLoginError("");
  };

  // Open modal to create a new product
  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      description: "",
      collection: "alankritha",
      category: "Kurtas",
      subcategory: "Straight Fit",
      price: "",
      salePrice: "",
      image: "",
      isFeatured: false,
      isNewArrival: true,
      status: "enabled",
      sizeStock: { "S": 4, "M": 6, "L": 4, "XL": 2, "XXL": 0 }
    });
    setNewFormProductId(newProductId());
    setFormError("");
    setIsProductModalOpen(true);
  };

  // Open modal to edit existing product
  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      collection: product.collection || (product.category === "Sarees" ? "ayanaa" : "alankritha"),
      category: product.category as "Kurtas" | "Sarees",
      subcategory: product.subcategory || (product.category === "Sarees" ? "Banarasi Silk" : "Straight Fit"),
      price: product.price.toString(),
      salePrice: product.salePrice ? product.salePrice.toString() : "",
      image: product.image,
      isFeatured: !!product.isFeatured,
      isNewArrival: !!product.isNewArrival,
      status: product.status,
      sizeStock: Object.fromEntries(ALL_SIZES.map((sz) => [sz, product.sizeStock?.[sz] ?? 0]))
    });
    setFormError("");
    setIsProductModalOpen(true);
  };

  // Save product (Create or Update) to Supabase. On failure the form stays open with what was typed.
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProductRef.current || imageUploading) return;
    const checked = checkProductForm(formData);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }

    savingProductRef.current = true;
    setSavingProduct(true);
    setFormError("");
    try {
      const draft = checked.value;
      const result = editingProduct
        ? await catalogueAdmin.updateProduct(editingProduct, draft)
        : await catalogueAdmin.createProduct(newFormProductId, draft);
      if (!result.ok) {
        setFormError(result.error);
        if (result.stockChanged) await showLiveStockInForm(editingProduct?.id ?? newFormProductId, editingProduct);
        return;
      }
      await showSaved(editingProduct ? `Saved “${draft.name}”.` : `Added “${draft.name}”.`);
      setIsProductModalOpen(false);
    } finally {
      savingProductRef.current = false;
      setSavingProduct(false);
    }
  };

  // A form save refused because stock changed meanwhile: keep what was typed, but put the
  // live stock in the size boxes, and compare the next save with these numbers
  const showLiveStockInForm = async (productId: string, loaded: Product | null) => {
    await productService.reloadCatalogue();
    refreshData();
    const fresh = productService.getProductById(productId);
    if (!fresh) return;
    // Kept as first loaded: a category change still counts as one (old sizes get removed)
    if (loaded) setEditingProduct({ ...fresh, category: loaded.category });
    setFormData((prev) => ({ ...prev, sizeStock: Object.fromEntries(ALL_SIZES.map((sz) => [sz, fresh.sizeStock?.[sz] ?? 0])) }));
  };

  const closeProductModal = () => {
    if (!savingProductRef.current && !imageUploading) setIsProductModalOpen(false);
  };

  // Handle Delete Product Confirmation
  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const product = productToDelete;
    setDeleteError("");
    const key = `delete:${product.id}`;
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPending((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await catalogueAdmin.deleteProduct(product.id);
      if (result.ok) {
        await showSaved(`Deleted “${product.name}”.`);
        setProductToDelete(null);
      } else {
        setDeleteError(result.error);
      }
    } finally {
      pendingRef.current.delete(key);
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Toggle status directly from table
  const handleToggleStatus = (product: Product) => {
    const next = product.status === "enabled" ? "disabled" : "enabled";
    return runAction(
      `status:${product.id}`,
      () => catalogueAdmin.setStatus(product.id, next),
      next === "enabled" ? `“${product.name}” is now published.` : `“${product.name}” is now hidden from the shop.`
    );
  };

  // Change an order's status or payment through admin_update_order_status. The database
  // checks the admin and the allowed changes; the list is then read again, so what is
  // shown is what was saved.
  const handleChangeOrder = async (order: Order, change: { status?: OrderStatus; paymentStatus?: PaymentStatus }) => {
    if (orderBusyRef.current) return;
    if (
      (change.status === "Cancelled" || change.status === "Returned") &&
      !window.confirm(`Mark order ${order.reference} as ${change.status}? Its pieces go back into stock, and this can't be undone.`)
    ) {
      return;
    }
    orderBusyRef.current = true;
    setOrderBusy(order.id);
    try {
      const result = await orderApi.updateStatus(order.id, change);
      if (result.ok) {
        const what = change.status ? `is now ${result.status}` : `is marked ${result.paymentStatus}`;
        setNotice({ kind: "success", text: result.changed ? `Order ${order.reference} ${what}.` : `Order ${order.reference} was already up to date.` });
        // Cancelled and Returned orders put their stock back
        if (result.status === "Cancelled" || result.status === "Returned") {
          productService.reloadCatalogue().then((reloaded) => {
            if (reloaded) refreshData();
          });
        }
      } else {
        setNotice({ kind: "error", text: `Order ${order.reference}: ${result.error}` });
      }
      await loadOrders();
    } finally {
      orderBusyRef.current = false;
      setOrderBusy(null);
    }
  };

  // Update size inventory directly (saved when the field is left or Enter is pressed)
  const handleStockSave = (product: Product, size: string, value: string) =>
    runAction(
      `stock:${product.id}:${size}`,
      () => catalogueAdmin.setSizeStock(product, size, value),
      `Saved ${describeSize(size)} stock for “${product.name}”.`
    );

  // "+5 All" adds 5 to every size; "Mark Out" sets every size to 0
  const handleRestock = (product: Product) =>
    runAction(`stock-all:${product.id}`, () => catalogueAdmin.setAllSizes(product, (q) => Math.min(MAX_STOCK, q + 5)), `Added 5 to every size of “${product.name}”.`);

  const handleMarkOut = (product: Product) =>
    runAction(`stock-all:${product.id}`, () => catalogueAdmin.setAllSizes(product, () => 0), `“${product.name}” is now out of stock in every size.`);

  // =========================================================================
  // VIEW 1: ADMIN LOGIN SCREEN (same look as the customer sign-in page)
  // =========================================================================
  if (authState.status === "loading") {
    return (
      <div className="min-h-[100svh] bg-canvas flex items-center justify-center" role="status" aria-live="polite">
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          Checking admin sign-in…
        </span>
      </div>
    );
  }

  if (authState.status !== "admin") {
    const notice = authState.status === "signed-out" ? authState.notice : undefined;
    return (
      <div className="min-h-[100svh] bg-canvas font-sans text-ink">
        <div className="relative isolate overflow-hidden w-full min-h-[100svh] flex flex-col items-center">
          {/* Floral sprigs at the page edges (decorative; smaller and fainter on phones) */}
          <FloralSprig className="absolute -z-10 left-0 top-28 md:top-1/2 md:-translate-y-1/2 h-48 md:h-[26rem] lg:h-[30rem] w-auto text-line-strong opacity-50 md:opacity-100" />
          <FloralSprig className="absolute -z-10 right-0 bottom-20 md:bottom-auto md:top-1/2 md:-translate-y-1/2 h-48 md:h-[26rem] lg:h-[30rem] w-auto text-line-strong -scale-x-100 opacity-50 md:opacity-100" />

          {/* Brand mark */}
          <div className="flex flex-col items-center gap-2 pt-8 sm:pt-10 px-4">
            <img src="/images/logo-144.png" width={159} height={144} alt="" className="h-11 sm:h-12 w-auto object-contain" decoding="async" />
            <span className="font-serif text-base tracking-[0.3em] text-ink uppercase">{BOUTIQUE_CONFIG.brandName}</span>
            <span className="eyebrow text-maroon-700">Admin</span>
          </div>

          {/* Form column, vertically centred in the remaining space */}
          <div className="relative w-full max-w-[450px] flex-1 flex flex-col justify-center px-4 pt-8 sm:pt-10 pb-20">
            <h1 className="font-serif text-[1.75rem] sm:text-[2rem] text-ink text-center">Admin Sign In</h1>
            <p className="text-base text-ink/85 mt-3 text-center">Enter your admin email and password</p>

            {authState.status === "unavailable" ? (
              <div className="status-note status-note-danger mt-7" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0 text-danger" />
                <span>Admin sign-in isn't available on this site right now.</span>
              </div>
            ) : (
            <form onSubmit={handleLogin} className="mt-7 space-y-3" id="admin-login-form">
              {(loginError || notice) && (
                <div className="status-note status-note-danger" role="alert">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-danger" />
                  <span>{loginError || notice}</span>
                </div>
              )}

              <LabelledBox label="Admin Email Address" htmlFor="admin-email-input">
                <input
                  id="admin-email-input"
                  type="email"
                  required
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="owner@anvaya.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className={BOX_INPUT}
                  disabled={loginLoading}
                />
              </LabelledBox>

              <LabelledBox
                label="Password"
                htmlFor="admin-password-input"
                action={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    aria-controls="admin-password-input"
                    className="btn-icon btn-icon-sm rounded-xs"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              >
                <input
                  id="admin-password-input"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={BOX_INPUT}
                  disabled={loginLoading}
                />
              </LabelledBox>

              <button
                type="submit"
                disabled={loginLoading}
                aria-busy={loginLoading}
                className="w-full !mt-4 h-14 sm:h-16 flex items-center justify-center gap-2 bg-maroon-600 text-white text-base font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-maroon-700 disabled:opacity-70 cursor-pointer disabled:cursor-default"
              >
                {loginLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>
            )}

            <button
              type="button"
              onClick={onReturnToStore}
              className="mt-6 mx-auto inline-flex items-center text-sm font-medium text-muted hover:text-ink transition-colors cursor-pointer group"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5 transition-transform group-hover:-translate-x-1" />
              <span>Back to store</span>
            </button>
          </div>

          {/* Scalloped dome border along the bottom of the sign-in area */}
          <DomeBorder patternId="admin-login-domes" />
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: AUTHENTICATED ADMIN DASHBOARD
  // =========================================================================
  const sections: { id: AdminSection; label: string; count?: number; newCount?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products", count: products.length },
    { id: "inventory", label: "Inventory" },
    { id: "orders", label: "Orders", count: orders.length, newCount: orderAlerts.unseenCount },
  ];
  const activeSection = sections.find((s) => s.id === activeTab) ?? sections[0];

  // Section chosen from the menu: show it from the top
  const openSection = (id: AdminSection) => {
    setActiveTab(id);
    setSectionMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans">
      
      {/* Top Administrative Header */}
      <header className="bg-surface border-b border-line sticky top-0 z-40">
        <div className="container-page">
          <div className="flex items-center justify-between gap-3 h-16">

            {/* Brand Title */}
            <div className="flex items-center space-x-3 min-w-0">
              <img
                src="/images/logo-144.png" width={159} height={144}
                alt="ANVAYA emblem"
                className="h-8 w-auto object-contain shrink-0"
                decoding="async"
              />
              {/* Wordmark makes room for the section menu on the narrowest phones */}
              <div className="max-[359px]:sr-only">
                <span className="font-serif text-lg tracking-[0.18em] text-ink uppercase">
                  ANVAYA
                </span>
                <span className="eyebrow ml-2 hidden sm:inline">
                  Admin Dashboard
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden lg:inline-flex segmented" role="tablist" aria-label="Dashboard sections">
              <button
                onClick={() => setActiveTab("overview")}
                role="tab"
                aria-selected={activeTab === "overview"}
                className="segmented-item"
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab("products")}
                role="tab"
                aria-selected={activeTab === "products"}
                className="segmented-item"
              >
                Products ({products.length})
              </button>
              <button
                onClick={() => setActiveTab("inventory")}
                role="tab"
                aria-selected={activeTab === "inventory"}
                className="segmented-item"
              >
                Inventory
              </button>
              <button
                onClick={() => setActiveTab("orders")}
                role="tab"
                aria-selected={activeTab === "orders"}
                className="segmented-item"
              >
                <span>Orders</span>
                <span className="badge badge-neutral tabular-nums">
                  {orders.length}
                </span>
                {orderAlerts.unseenCount > 0 && (
                  <span className="badge badge-sale tabular-nums">{orderAlerts.unseenCount} new</span>
                )}
              </button>
            </nav>

            {/* Right: section menu (narrower screens), Return to Store & Logout */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSectionMenuOpen(true)}
                aria-expanded={sectionMenuOpen}
                aria-controls="admin-section-menu"
                aria-haspopup="dialog"
                className="lg:hidden btn btn-secondary btn-sm"
                id="admin-section-menu-toggle"
              >
                <Menu className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only">Dashboard menu, current section:</span>
                <span>{activeSection.label}</span>
                {orderAlerts.unseenCount > 0 && (
                  <span className="badge badge-sale tabular-nums">{orderAlerts.unseenCount} new</span>
                )}
              </button>

              <button
                onClick={onReturnToStore}
                className="hidden sm:inline-flex btn btn-secondary btn-sm"
                title="Open storefront"
              >
                <Store className="w-3.5 h-3.5" />
                <span>View Store</span>
              </button>

              <span className="hidden xl:inline text-xs text-muted max-w-[14rem] truncate" title={authState.email}>
                {authState.email}
              </span>
              <button
                onClick={handleLogout}
                disabled={signingOut}
                aria-busy={signingOut}
                className="btn btn-ghost btn-sm"
                title={`Sign out ${authState.email}`}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign Out"}</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      <AdminSectionMenu
        isOpen={sectionMenuOpen}
        onClose={() => setSectionMenuOpen(false)}
        sections={sections}
        activeSection={activeTab}
        onSelect={openSection}
        email={authState.email}
        onViewStore={() => {
          setSectionMenuOpen(false);
          onReturnToStore();
        }}
        onSignOut={() => {
          setSectionMenuOpen(false);
          handleLogout();
        }}
        signingOut={signingOut}
      />

      {/* Main Content Area */}
      <main className="flex-1 container-page py-8">
        <OrderAlertBar
          unseenCount={orderAlerts.unseenCount}
          onViewOrders={() => {
            orderAlerts.markSeen();
            openSection("orders");
          }}
          soundOn={orderAlerts.soundOn}
          onToggleSound={orderAlerts.toggleSound}
          notificationState={orderAlerts.notificationState}
          onToggleNotifications={() => void orderAlerts.toggleNotifications()}
        />

        {/* Result of the latest product change */}
        {notice && (
          <div
            className={`status-note status-note-${notice.kind === "error" ? "danger" : notice.kind} mb-6`}
            role={notice.kind === "success" ? "status" : "alert"}
          >
            {notice.kind === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="btn-icon btn-icon-sm" aria-label="Dismiss message">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & ANALYTICS */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Welcome banner */}
            <div className="panel p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="heading-card">
                  Welcome
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Managing ANVAYA ethnic wear boutique collections: Alankritha (Kurtas) and Ayanaa (Sarees).
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleOpenAddModal}
                  className="btn btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Outfit</span>
                </button>
              </div>
            </div>

            {/* Metric KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              
              {/* Card 1: Total Products */}
              <div className="panel p-5">
                <div className="flex items-center justify-between field-label mb-2">
                  <span>Total Catalogue</span>
                  <Package className="w-4 h-4 text-neutral-400" />
                </div>
                <div className="font-serif text-3xl text-ink tabular-nums">
                  {metrics.totalCount}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {metrics.kurtasCount} Kurtas (Alankritha) · {metrics.sareesCount} Sarees (Ayanaa)
                </div>
              </div>

              {/* Card 2: In-Stock Products */}
              <div className="panel p-5">
                <div className="flex items-center justify-between field-label mb-2">
                  <span>In Stock</span>
                  <CheckCircle2 className="w-4 h-4 text-success" />
                </div>
                <div className="font-serif text-3xl text-success tabular-nums">
                  {metrics.inStockCount}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Available for immediate dispatch
                </div>
              </div>

              {/* Card 3: Out-of-Stock Products */}
              <div className="panel p-5">
                <div className="flex items-center justify-between field-label mb-2">
                  <span>Sold Out</span>
                  <AlertTriangle className="w-4 h-4 text-danger" />
                </div>
                <div className="font-serif text-3xl text-danger tabular-nums">
                  {metrics.outOfStockCount}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Requires inventory restock
                </div>
              </div>

              {/* Card 4: Orders & Revenue */}
              <div className="panel p-5">
                <div className="flex items-center justify-between field-label mb-2">
                  <span>Total Orders</span>
                  <ShoppingBag className="w-4 h-4 text-neutral-400" />
                </div>
                <div className="font-serif text-3xl text-ink tabular-nums">
                  {metrics.totalOrdersCount}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  ₹{metrics.revenue.toLocaleString("en-IN")} gross volume
                </div>
              </div>

            </div>

            {/* Two Columns: Recent Orders & Quick Management */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Recent Orders List (2 Cols) */}
              <div className="lg:col-span-2 panel p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-line">
                  <h3 className="heading-label">
                    Recent Customer Orders
                  </h3>
                  <button
                    onClick={() => setActiveTab("orders")}
                    className="link text-xs"
                  >
                    View All Orders →
                  </button>
                </div>

                <div className="divide-y divide-line">
                  <OrdersLoadNote load={ordersLoad} empty={orders.length === 0} onRetry={loadOrders} className="py-6" />
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900">
                          {order.customerName} · <span className="text-neutral-400 tabular-nums">{order.reference}</span>
                        </div>
                        <div className="text-neutral-500 mt-0.5">
                          {order.items.map(i => `${i.name} (${i.selectedSize})`).join(", ")}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-neutral-900 tabular-nums">
                          ₹{order.total.toLocaleString("en-IN")}
                        </div>
                        <span className={`badge mt-1 ${orderStatusTone(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Collections Summary Card (1 Col) */}
              <div className="panel p-6 flex flex-col justify-between">
                <div>
                  <h3 className="heading-label mb-4 pb-3 border-b border-line">
                    Collections Breakdown
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="panel-muted p-4">
                      <div className="text-xs font-bold text-neutral-900 uppercase">
                        Alankritha Collection
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Exclusively Women's Kurtas
                      </div>
                      <div className="mt-2 text-sm font-semibold text-neutral-800">
                        {metrics.kurtasCount} active pieces
                      </div>
                    </div>

                    <div className="panel-muted p-4">
                      <div className="text-xs font-bold text-neutral-900 uppercase">
                        Ayanaa Collection
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Exclusively Women's Sarees
                      </div>
                      <div className="mt-2 text-sm font-semibold text-neutral-800">
                        {metrics.sareesCount} active pieces
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-line mt-6">
                  <div className="text-xs text-neutral-500">
                    <strong>WhatsApp Business:</strong> {BOUTIQUE_CONFIG.supportPhone}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    <strong>Support email:</strong>{" "}
                    {BOUTIQUE_CONFIG.supportEmail || "not set yet (add it to supportEmail in src/config.ts)"}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PRODUCT MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === "products" && (
          <div className="space-y-6">
            
            {/* Section Header */}
            <div className="panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="heading-card">
                  Product Management
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  View, edit, toggle visibility, and update pricing across Alankritha & Ayanaa collections.
                </p>
              </div>
              <button
                onClick={handleOpenAddModal}
                className="btn btn-primary shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
            </div>

            {/* Filters & Search Toolbar */}
            <div className="panel p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search by name, silhouette, or category..."
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  className="field field-sm pl-9"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Collection Filter */}
                <select
                  value={prodCollectionFilter}
                  onChange={(e) => setProdCollectionFilter(e.target.value as any)}
                  className="field field-sm w-auto"
                >
                  <option value="All">All Collections</option>
                  <option value="alankritha">Alankritha (Kurtas)</option>
                  <option value="ayanaa">Ayanaa (Sarees)</option>
                </select>

                {/* Status Filter */}
                <select
                  value={prodStatusFilter}
                  onChange={(e) => setProdStatusFilter(e.target.value as any)}
                  className="field field-sm w-auto"
                >
                  <option value="All">All Statuses</option>
                  <option value="enabled">Published Only</option>
                  <option value="disabled">Unpublished (Hidden)</option>
                </select>
              </div>

            </div>

            {/* Products Table */}
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="ds-table ds-table-stack">
                  <thead>
                    <tr>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Collection / Type</th>
                      <th className="py-3 px-4">Retail Price</th>
                      <th className="py-3 px-4">Sizes & Stock</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredProducts.map((p) => {
                      const totalStock = productService.getTotalStock(p);
                      const isPublished = p.status === "enabled";

                      return (
                        <tr key={p.id}>
                          {/* Image & Title */}
                          <td data-label="" className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <ProductImage src={getProductImage(p)} alt={p.name} className="w-12 h-14 object-cover shrink-0" compact />
                              <div className="max-w-xs">
                                <div className="font-semibold text-neutral-900 line-clamp-1">
                                  {p.name}
                                </div>
                                <div className="text-xs text-neutral-500 tabular-nums">
                                  {p.id}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Collection / Type */}
                          <td data-label="Collection / Type" className="py-3 px-4">
                            <div className="font-medium text-neutral-800">
                              {p.collection === "alankritha" ? "Alankritha" : "Ayanaa"}
                            </div>
                            <div className="text-neutral-500 text-xs">
                              {p.category} {p.subcategory ? `· ${p.subcategory}` : ""}
                            </div>
                          </td>

                          {/* Price */}
                          <td data-label="Retail Price" className="py-3 px-4">
                            <div className="font-semibold text-neutral-900 tabular-nums">
                              ₹{(p.salePrice || p.price).toLocaleString("en-IN")}
                            </div>
                            {p.salePrice && p.salePrice < p.price && (
                              <div className="price-was text-2xs">
                                MRP ₹{p.price.toLocaleString("en-IN")}
                              </div>
                            )}
                          </td>

                          {/* Sizes & Stock */}
                          <td data-label="Sizes & Stock" className="py-3 px-4">
                            <div className="flex items-center space-x-1.5">
                              <span className={`w-2 h-2 rounded-full ${totalStock > 0 ? "bg-success" : "bg-danger"}`} />
                              <span className="font-semibold text-neutral-800 tabular-nums">
                                {totalStock} in stock
                              </span>
                            </div>
                            <div className="text-2xs text-neutral-500 mt-0.5">
                              {getSizeOptions(p).map((sz) => `${sz}:${p.sizeStock?.[sz] ?? 0}`).join(" ")}
                            </div>
                          </td>

                          {/* Published Status Toggle */}
                          <td data-label="Status" className="py-3 px-4">
                            <button
                              onClick={() => handleToggleStatus(p)}
                              disabled={!!pending[`status:${p.id}`]}
                              aria-busy={!!pending[`status:${p.id}`]}
                              title={isPublished ? "Hide from the shop" : "Publish to the shop"}
                              className={`badge cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-default ${
                                isPublished ? "badge-success hover:bg-success-line" : "badge-neutral hover:bg-line"
                              }`}
                            >
                              {pending[`status:${p.id}`] ? "Saving…" : isPublished ? "Published" : "Draft / Hidden"}
                            </button>
                          </td>

                          {/* Actions */}
                          <td data-label="Actions" className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleOpenEditModal(p)}
                                className="btn-icon btn-icon-sm"
                                title="Edit product"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setProductToDelete(p)}
                                className="btn-icon btn-icon-sm !text-danger hover:!bg-danger-soft"
                                title="Delete product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: INVENTORY MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === "inventory" && (
          <div className="space-y-6">
            <div className="panel p-5">
              <h2 className="heading-card">
                Inventory & Size Stock Management
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Quickly adjust variant quantities, restock batches, or zero-out depleted styles.
              </p>
              <div className="relative mt-4">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search by product name, ID, or collection..."
                  aria-label="Search inventory"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className={`field field-sm field-touch pl-9 ${inventorySearch ? "pr-9" : ""}`}
                  id="admin-inventory-search"
                />
                {inventorySearch && (
                  <button
                    type="button"
                    onClick={() => setInventorySearch("")}
                    aria-label="Clear inventory search"
                    className="btn-icon btn-icon-sm absolute right-1 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {inventoryProducts.length === 0 ? (
              <div className="panel p-8 text-center text-sm text-muted" role="status">
                No products found
              </div>
            ) : (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="ds-table ds-table-stack">
                  <thead>
                    <tr>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Collection</th>
                      <th className="py-3 px-4">Size Counts (Editable)</th>
                      <th className="py-3 px-4">Total Stock</th>
                      <th className="py-3 px-4 text-right">Quick Restock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {inventoryProducts.map((p) => {
                      const total = productService.getTotalStock(p);
                      return (
                        <tr key={p.id}>
                          <td data-label="" className="py-3 px-4">
                            <div className="font-semibold text-neutral-900 line-clamp-1">
                              {p.name}
                            </div>
                            <div className="text-xs text-neutral-400 tabular-nums">
                              {p.id}
                            </div>
                          </td>
                          <td data-label="Collection" className="py-3 px-4">
                            <span className="text-xs text-neutral-700 font-medium">
                              {p.collection === "alankritha" ? "Alankritha (Kurtas)" : "Ayanaa (Sarees)"}
                            </span>
                          </td>
                          <td data-label="Size Counts (Editable)" className="ds-cell-block py-3 px-4">
                            <div className="flex flex-wrap items-center gap-2">
                              {getSizeOptions(p).map((size) => (
                                <div key={size} className="flex items-center space-x-1 panel-muted px-2 py-1">
                                  <span className="font-bold text-neutral-600 text-2xs">{size}:</span>
                                  <StockInput
                                    value={p.sizeStock?.[size] ?? 0}
                                    label={`Stock for ${describeSize(size)} of ${p.name}`}
                                    saving={!!pending[`stock:${p.id}:${size}`] || !!pending[`stock-all:${p.id}`]}
                                    onSave={(value) => handleStockSave(p, size, value)}
                                  />
                                </div>
                              ))}
                            </div>
                          </td>
                          <td data-label="Total Stock" className="py-3 px-4">
                            <span className={`font-bold tabular-nums ${total > 0 ? "text-success" : "text-danger"}`}>
                              {total} units
                            </span>
                          </td>
                          <td data-label="Quick Restock" className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleRestock(p)}
                                disabled={!!pending[`stock-all:${p.id}`]}
                                title="Add 5 to every size"
                                className="btn btn-secondary btn-sm"
                              >
                                +5 All
                              </button>
                              <button
                                onClick={() => handleMarkOut(p)}
                                disabled={!!pending[`stock-all:${p.id}`]}
                                title="Set every size to 0"
                                className="btn btn-danger-soft btn-sm"
                              >
                                Mark Out
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: ORDERS MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            <div className="panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="heading-card">
                  Customer Orders & Fulfillment
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Review COD orders, check delivery addresses, and update fulfillment states.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter */}
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="field field-sm w-auto"
                  aria-label="Filter orders by status"
                >
                  <option value="All">All Order Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Returned">Returned</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadOrders()}
                  disabled={ordersLoad.status === "loading"}
                  className="btn btn-secondary btn-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ordersLoad.status === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
                  Refresh
                </button>
              </div>
            </div>

            <div className="panel overflow-hidden">
              <OrdersLoadNote load={ordersLoad} empty={orders.length === 0} onRetry={loadOrders} className="p-6" />
              {ordersLoad.status === "ready" && orders.length > 0 && filteredOrders.length === 0 && (
                <p className="p-6 text-center text-xs text-muted">No orders match this filter.</p>
              )}
              {filteredOrders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="ds-table ds-table-stack">
                  <thead>
                    <tr>
                      <th className="py-3 px-4">Order & Date</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Destination</th>
                      <th className="py-3 px-4">Items</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredOrders.map((o) => (
                      <tr key={o.id}>
                        <td data-label="" className="py-3 px-4">
                          <div className="tabular-nums font-bold text-neutral-900">{o.reference}</div>
                          <div className="text-neutral-400 text-xs">{o.date} {o.time} IST</div>
                        </td>
                        <td data-label="Customer" className="py-3 px-4">
                          <div className="font-semibold text-neutral-800">{o.customerName}</div>
                          <div className="text-neutral-500 text-xs">{o.customerPhone}</div>
                        </td>
                        <td data-label="Destination" className="py-3 px-4 text-neutral-600">
                          {o.city}, {o.state} ({o.pincode})
                        </td>
                        <td data-label="Items" className="py-3 px-4">
                          <span className="font-semibold text-neutral-800">
                            {o.items.reduce((s, i) => s + i.quantity, 0)} items
                          </span>
                        </td>
                        <td data-label="Total" className="py-3 px-4 font-semibold text-neutral-900 tabular-nums">
                          ₹{o.total.toLocaleString("en-IN")}
                          <div className="text-neutral-500 text-xs font-normal">{o.paymentStatus}</div>
                        </td>
                        <td data-label="Status" className="py-3 px-4">
                          <OrderStatusControl order={o} busy={orderBusy === o.id} disabled={orderBusy !== null} onChange={(status) => void handleChangeOrder(o, { status })} />
                        </td>
                        <td data-label="Details" className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedOrderId(o.id)}
                            className="btn btn-secondary btn-sm"
                            aria-label={`View order ${o.reference}`}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              {ordersLoad.status === "ready" && orders.length + ordersLoad.skipped >= MAX_ORDERS && (
                <p className="px-4 py-3 border-t border-line text-xs text-muted">
                  Showing the latest {MAX_ORDERS} orders. Older orders are kept in Supabase.
                </p>
              )}
              {ordersLoad.status === "ready" && ordersLoad.skipped > 0 && (
                <p className="px-4 py-3 border-t border-line text-xs text-warning">
                  {ordersLoad.skipped} order{ordersLoad.skipped === 1 ? "" : "s"} couldn't be shown because the saved figures don't add up. Check them in Supabase.
                </p>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT PRODUCT */}
      {/* ========================================================================= */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs">
          <div className="dialog-panel bg-surface max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h3 className="heading-card text-lg sm:text-lg">
                  {editingProduct ? "Edit Product" : "Add New Handcrafted Outfit"}
                </h3>
                <p className="text-xs text-neutral-500">
                  Fill in product details and stock for Alankritha or Ayanaa collection.
                </p>
              </div>
              <button
                onClick={closeProductModal}
                disabled={savingProduct || imageUploading}
                className="btn-icon btn-icon-sm" aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4" aria-busy={savingProduct}>
              {formError && (
                <div className="status-note status-note-danger" role="alert">
                  {formError}
                </div>
              )}

              <fieldset disabled={savingProduct} className="space-y-4 min-w-0">

              {/* Title */}
              <div>
                <label className="field-label">
                  Product Name / Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="e.g. Mustard Yellow Silk Chanderi Embroidered Kurta"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="field"
                />
              </div>

              {/* Description */}
              <div>
                <label className="field-label">
                  Product Description *
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  placeholder="Detailed description of weave, fabric composition, embroidery work, and care instructions..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="field"
                />
              </div>

              {/* Category & Collection Mapping: STRICTLY KURTAS OR SAREES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    Collection & Type *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const newCat = e.target.value as "Kurtas" | "Sarees";
                      setFormData({
                        ...formData,
                        category: newCat,
                        collection: newCat === "Sarees" ? "ayanaa" : "alankritha",
                        subcategory: COLLECTION_STYLES[newCat === "Sarees" ? "ayanaa" : "alankritha"][0]
                      });
                    }}
                    className="field"
                  >
                    <option value="Kurtas">Alankritha — Kurtas</option>
                    <option value="Sarees">Ayanaa — Handwoven Sarees</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">
                    Silhouette / Weave Style
                  </label>
                  <select
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    className="field"
                  >
                    {COLLECTION_STYLES[formData.collection].map((style) => (
                      <option key={style} value={style}>{style}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    Retail Price (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    required
                    placeholder="3999"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="field tabular-nums"
                  />
                </div>

                <div>
                  <label className="field-label">
                    Promotional Sale Price (₹ Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="2999"
                    value={formData.salePrice}
                    onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                    className="field tabular-nums"
                  />
                </div>
              </div>

              {/* Image URL & Preview */}
              <div>
                <label htmlFor="admin-product-image" className="field-label">
                  Product Image (optional)
                </label>
                <input
                  id="admin-product-image"
                  type="text"
                  placeholder="/images/products/alk-001-front.jpg or https://..."
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  className="field"
                  aria-describedby="admin-product-image-help"
                />
                <p id="admin-product-image-help" className="field-help">
                  Upload a photo below, or use a local file in public/images/products (e.g. /images/products/alk-001-front.jpg)
                  or a full https:// URL. Leave empty to show the &ldquo;Image coming soon&rdquo; placeholder. Files mapped in
                  src/data/imageRegistry.ts take priority.
                </p>
                {/* Keyed by product, so a new form starts without the last upload's state */}
                <React.Fragment key={editingProduct?.id ?? newFormProductId}>
                  <ProductImageUpload
                    productId={editingProduct?.id ?? newFormProductId}
                    onBusyChange={setImageUploading}
                    onUploaded={(url) => setFormData((prev) => ({ ...prev, image: url }))}
                  />
                </React.Fragment>
                <div className="mt-2 flex items-center space-x-3 p-2 panel-muted">
                  {/* Shows the placeholder when empty or when the image cannot be loaded */}
                  <ProductImage
                    src={formData.image.trim()}
                    alt="Product image preview"
                    className="w-12 h-16 object-cover"
                    compact
                  />
                  <span className="text-xs text-muted">Preview</span>
                </div>
              </div>

              {/* Size Stocks */}
              <div>
                <label className="field-label">
                  Available Size Inventory Units
                </label>
                <div className={`grid gap-2 sm:gap-3 ${formData.category === "Sarees" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 min-[400px]:grid-cols-5"}`}>
                  {getSizeOptionsFor(formData.category).map(sz => (
                    <div key={sz} className="text-center">
                      <span className="field-label text-center">{sz === FREE_SIZE ? sz : `Size ${sz}`}</span>
                      <input
                        type="number"
                        min="0"
                        max={MAX_STOCK}
                        step="1"
                        inputMode="numeric"
                        aria-label={`Stock for ${describeSize(sz)}`}
                        value={formData.sizeStock[sz] ?? 0}
                        onChange={(e) => setFormData({
                          ...formData,
                          sizeStock: { ...formData.sizeStock, [sz]: e.target.value }
                        })}
                        className="field field-sm text-center tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Status & Badges */}
              <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-line">
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.status === "enabled"}
                    onChange={(e) => setFormData({ ...formData, status: e.target.checked ? "enabled" : "disabled" })}
                    className="checkbox"
                  />
                  <span>Published to Storefront</span>
                </label>

                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    className="checkbox"
                  />
                  <span>Featured Piece</span>
                </label>

                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isNewArrival}
                    onChange={(e) => setFormData({ ...formData, isNewArrival: e.target.checked })}
                    className="checkbox"
                  />
                  <span>New Arrival Badge</span>
                </label>
              </div>

              </fieldset>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={closeProductModal}
                  disabled={savingProduct || imageUploading}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct || imageUploading}
                  aria-busy={savingProduct}
                  className="btn btn-primary"
                >
                  {savingProduct ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    "Save Product"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ========================================================================= */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs">
          <div className="dialog-panel bg-surface max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="heading-card text-lg sm:text-lg mb-1">
              Delete Product?
            </h3>
            <p className="text-body mb-6">
              Are you sure you want to delete <strong>"{productToDelete.name}"</strong>? This permanently removes it, its stock and its reviews from the boutique catalogue.
            </p>
            {deleteError && (
              <div className="status-note status-note-danger mb-4 text-left" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => {
                  setProductToDelete(null);
                  setDeleteError("");
                }}
                disabled={!!pending[`delete:${productToDelete.id}`]}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProduct}
                disabled={!!pending[`delete:${productToDelete.id}`]}
                aria-busy={!!pending[`delete:${productToDelete.id}`]}
                className="btn btn-danger"
              >
                {pending[`delete:${productToDelete.id}`] ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ORDER DETAILS */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs">
          <div className="dialog-panel bg-surface max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h3 className="heading-card text-lg sm:text-lg tabular-nums">
                  Order #{selectedOrder.reference}
                </h3>
                <p className="text-xs text-neutral-500">
                  {selectedOrder.date} at {selectedOrder.time} IST · Cash on Delivery · {selectedOrder.paymentStatus}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrderId(null)}
                className="btn-icon btn-icon-sm" aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Customer Info */}
              <div className="panel-muted p-3">
                <div className="font-bold text-neutral-900">{selectedOrder.customerName}</div>
                <div className="text-neutral-600 mt-0.5">
                  {selectedOrder.customerPhone}
                  {selectedOrder.customerEmail ? ` · ${selectedOrder.customerEmail}` : ""}
                </div>
                <div className="text-neutral-500 mt-1">
                  {selectedOrder.address}, {selectedOrder.city}, {selectedOrder.state} - {selectedOrder.pincode}
                </div>
              </div>

              {/* Items List */}
              <div className="panel overflow-hidden">
                <div className="bg-surface-muted px-3 py-2 field-label mb-0 border-b border-line">
                  Ordered Items
                </div>
                <div className="divide-y divide-line">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-neutral-900">{item.name}</div>
                        <div className="text-neutral-500 text-xs">Size: {item.selectedSize} · Qty: {item.quantity}</div>
                      </div>
                      <div className="font-semibold text-neutral-900 tabular-nums">
                        ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
                <dl className="bg-surface-muted p-3 space-y-1 border-t border-line">
                  <div className="flex justify-between text-neutral-600">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">₹{(selectedOrder.subtotal ?? 0).toLocaleString("en-IN")}</dd>
                  </div>
                  {selectedOrder.discount ? (
                    <div className="flex justify-between text-neutral-600">
                      <dt>Coupon {selectedOrder.couponCode}</dt>
                      <dd className="tabular-nums">-₹{selectedOrder.discount.toLocaleString("en-IN")}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-neutral-600">
                    <dt>Delivery</dt>
                    <dd className="tabular-nums">{selectedOrder.shippingCost ? `₹${selectedOrder.shippingCost.toLocaleString("en-IN")}` : "Free"}</dd>
                  </div>
                  <div className="flex justify-between font-semibold text-ink pt-1">
                    <dt>Total Amount (COD):</dt>
                    <dd className="tabular-nums">₹{selectedOrder.total.toLocaleString("en-IN")}</dd>
                  </div>
                </dl>
              </div>

              {/* Fulfillment status and payment (only the changes the database allows) */}
              <div className="space-y-3">
                <div>
                  <span className="field-label">Fulfillment Status</span>
                  <OrderStatusControl
                    order={selectedOrder}
                    busy={orderBusy === selectedOrder.id}
                    disabled={orderBusy !== null}
                    onChange={(status) => void handleChangeOrder(selectedOrder, { status })}
                    wide
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Payment: <strong className="text-ink">{selectedOrder.paymentStatus}</strong>
                  </span>
                  {(() => {
                    const payment = nextPaymentStatus(selectedOrder);
                    return payment ? (
                      <button
                        type="button"
                        disabled={orderBusy !== null}
                        onClick={() => void handleChangeOrder(selectedOrder, { paymentStatus: payment })}
                        className="btn btn-secondary btn-sm"
                      >
                        {payment === "Paid" ? "Mark cash collected (Paid)" : "Mark refunded"}
                      </button>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-canvas border-t border-line flex justify-end">
              <button
                onClick={() => setSelectedOrderId(null)}
                className="btn btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const orderStatusTone = (status: OrderStatus) =>
  status === "Delivered" ? "badge-success" :
  status === "Shipped" || status === "Confirmed" ? "badge-neutral" :
  status === "Cancelled" || status === "Returned" ? "badge-danger" :
  "badge-warning";

/** Loading, error and empty states for the orders read from the database */
function OrdersLoadNote({
  load,
  empty,
  onRetry,
  className = "",
}: {
  load: { status: "loading" } | { status: "ready"; skipped: number } | { status: "error"; message: string };
  empty: boolean;
  onRetry: () => void;
  className?: string;
}) {
  if (load.status === "loading" && empty) {
    return (
      <p className={`flex items-center justify-center gap-2 text-xs text-muted ${className}`} role="status">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Loading orders…
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <div className={`status-note status-note-danger ${className}`} role="alert">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{load.message}</span>
        <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm">
          Try again
        </button>
      </div>
    );
  }
  if (load.status === "ready" && empty) {
    return <p className={`text-center text-xs text-muted ${className}`}>No orders yet. Orders placed on the website appear here.</p>;
  }
  return null;
}

/**
 * The order's current status, with only the changes the database allows next
 * (Cancelled and Returned are final, so those show as a badge).
 */
function OrderStatusControl({
  order,
  busy,
  disabled,
  onChange,
  wide = false,
}: {
  order: Order;
  busy: boolean;
  disabled: boolean;
  onChange: (status: OrderStatus) => void;
  wide?: boolean;
}) {
  const options = nextStatuses(order.status);
  if (options.length === 0) return <span className={`badge ${orderStatusTone(order.status)}`}>{order.status}</span>;
  return (
    <select
      value=""
      disabled={disabled}
      aria-busy={busy}
      aria-label={`Status of order ${order.reference}: ${order.status}. Change to`}
      onChange={(e) => {
        if (e.target.value) onChange(e.target.value as OrderStatus);
      }}
      className={`field ${wide ? "" : "field-sm w-auto"}`}
    >
      <option value="">{busy ? `${order.status} (saving…)` : order.status}</option>
      {options.map((status) => (
        <option key={status} value={status}>
          Change to {status}
        </option>
      ))}
    </select>
  );
}

/**
 * Slide-in section menu for screens narrower than the header tabs: every dashboard
 * section, then View Store and Sign Out. Choosing a section closes it; so do the
 * close button, the backdrop and Escape (focus handling via useOverlay).
 */
function AdminSectionMenu({
  isOpen,
  onClose,
  sections,
  activeSection,
  onSelect,
  email,
  onViewStore,
  onSignOut,
  signingOut,
}: {
  isOpen: boolean;
  onClose: () => void;
  sections: { id: AdminSection; label: string; count?: number; newCount?: number }[];
  activeSection: AdminSection;
  onSelect: (id: AdminSection) => void;
  email: string;
  onViewStore: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(isOpen, onClose, panelRef);

  // The header tabs take over from 1024px, so close the menu (and its scroll lock) there
  useEffect(() => {
    if (!isOpen) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const onChange = () => wide.matches && onClose();
    onChange();
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="admin-section-menu" exit={{ pointerEvents: "none" }} className="fixed inset-0 z-50 flex lg:hidden">
          <motion.div {...OVERLAY_MOTION.backdrop} className="overlay-backdrop" onClick={onClose} />
          <motion.div
            {...OVERLAY_MOTION.drawerLeft}
            ref={panelRef}
            tabIndex={-1}
            id="admin-section-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard menu"
            className="relative z-10 flex flex-col w-[85%] max-w-[340px] h-full bg-surface text-ink shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 px-5 h-16 border-b border-line shrink-0">
              <span className="eyebrow text-ink">Admin Dashboard</span>
              <button type="button" onClick={onClose} aria-label="Close menu" className="btn-icon -mr-2">
                <X className="w-5 h-5" strokeWidth={1.6} />
              </button>
            </div>

            <nav aria-label="Dashboard sections" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              <ul className="space-y-1">
                {sections.map((s) => {
                  const current = s.id === activeSection;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(s.id)}
                        aria-current={current ? "page" : undefined}
                        className={`w-full flex items-center justify-between gap-3 rounded-xs px-3 py-3 text-left text-sm font-semibold transition-colors ${
                          current ? "bg-surface-muted text-ink" : "text-ink-soft hover:bg-surface-muted hover:text-ink"
                        }`}
                      >
                        <span>{s.label}</span>
                        <span className="flex items-center gap-2">
                          {s.count !== undefined && (
                            <span className="badge badge-neutral tabular-nums">{s.count}</span>
                          )}
                          {!!s.newCount && <span className="badge badge-sale tabular-nums">{s.newCount} new</span>}
                          <ChevronRight className="w-4 h-4 text-muted" aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-line px-5 py-4 space-y-3 shrink-0">
              <p className="text-xs text-muted truncate" title={email}>
                Signed in as <span className="text-ink-soft font-semibold">{email}</span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onViewStore} className="btn btn-secondary btn-sm flex-1">
                  <Store className="w-3.5 h-3.5" />
                  <span>View Store</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={signingOut}
                  aria-busy={signingOut}
                  className="btn btn-ghost btn-sm flex-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Stock count for one size in the inventory table. Saved when the field is left or
 * Enter is pressed (not on every keystroke); Escape puts the saved value back. If a
 * save fails the typed value stays, marked invalid, so it can be fixed or retried.
 */
function StockInput({
  value,
  label,
  saving,
  onSave,
}: {
  value: number;
  label: string;
  saving: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  const committing = useRef(false);

  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);

  const commit = async () => {
    if (committing.current || draft.trim() === String(value)) return;
    committing.current = true;
    try {
      const ok = await onSave(draft);
      setInvalid(!ok);
    } finally {
      committing.current = false;
    }
  };

  return (
    <input
      type="number"
      min="0"
      max={MAX_STOCK}
      step="1"
      inputMode="numeric"
      value={draft}
      disabled={saving}
      aria-label={label}
      aria-invalid={invalid}
      onChange={(e) => {
        setDraft(e.target.value);
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(String(value));
          setInvalid(false);
        }
      }}
      className={`w-12 text-center text-xs bg-white border rounded-xs px-1 py-1.5 sm:py-0.5 focus:outline-none focus:border-neutral-800 disabled:opacity-60 ${
        invalid ? "border-danger" : "border-neutral-300"
      }`}
    />
  );
}

// New orders since the admin last looked, plus the optional sound and browser
// notification switches. Orders are re-read every minute while this page is open.
function OrderAlertBar({
  unseenCount,
  onViewOrders,
  soundOn,
  onToggleSound,
  notificationState,
  onToggleNotifications,
}: {
  unseenCount: number;
  onViewOrders: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  notificationState: NotificationState;
  onToggleNotifications: () => void;
}) {
  const notificationLabel = {
    on: "Notifications on",
    off: "Turn on notifications",
    blocked: "Notifications blocked in browser settings",
    unsupported: "Notifications not available on this device",
  }[notificationState];

  return (
    <div className="mb-6 space-y-2" id="order-alerts">
      {unseenCount > 0 && (
        <div className="status-note status-note-warning" role="status">
          <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 font-semibold">
            {unseenCount} new order{unseenCount === 1 ? "" : "s"} since you last checked
          </span>
          <button type="button" onClick={onViewOrders} className="btn btn-primary btn-sm">
            View orders
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span>New orders are checked every minute while this page is open.</span>
        <button type="button" onClick={onToggleSound} aria-pressed={soundOn} className="btn btn-ghost btn-sm">
          {soundOn ? <Volume2 className="w-3.5 h-3.5" aria-hidden="true" /> : <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />}
          {soundOn ? "Sound on" : "Sound off"}
        </button>
        <button
          type="button"
          onClick={onToggleNotifications}
          disabled={notificationState === "blocked" || notificationState === "unsupported"}
          aria-pressed={notificationState === "on"}
          className="btn btn-ghost btn-sm"
        >
          {notificationState === "on" ? <Bell className="w-3.5 h-3.5" aria-hidden="true" /> : <BellOff className="w-3.5 h-3.5" aria-hidden="true" />}
          {notificationLabel}
        </button>
      </div>
    </div>
  );
}

// Upload a product photo to Supabase Storage (services/imageUpload.ts). The photo is shrunk
// to WebP in the browser first; when the upload works its address fills the image field
// above, and the product is saved as usual. Nothing here deletes older photos.
function ProductImageUpload({
  productId,
  onUploaded,
  onBusyChange,
}: {
  productId: string;
  onUploaded: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [stage, setStage] = useState<"idle" | "preparing" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = stage === "preparing" || stage === "uploading";

  // The local preview is a temporary browser address: release it when replaced or closed
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy]);
  useEffect(() => () => onBusyChange(false), []);

  const handleFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = ""; // the same file can be picked again
    if (!file || busy) return;
    const problem = checkImageFile(file);
    if (problem) {
      setStage("error");
      setMessage(problem);
      return;
    }
    setStage("preparing");
    setMessage("");
    setProgress(0);
    const prepared = await compressImage(file);
    if (!prepared.ok) {
      setStage("error");
      setMessage(prepared.error);
      return;
    }
    setPreview(URL.createObjectURL(prepared.blob));
    setStage("uploading");
    const result = await uploadProductImage(productId, prepared.blob, setProgress);
    if (result.ok) {
      onUploaded(result.url);
      setStage("done");
      setMessage(`Uploaded (${Math.round(prepared.blob.size / 1024)} KB WebP). Save the product to use it.`);
    } else {
      setStage("error");
      setMessage(result.error);
    }
  };

  return (
    <div className="mt-2 panel-muted p-3 space-y-2" id="admin-product-image-upload">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`btn btn-secondary btn-sm ${busy ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{busy ? "Uploading…" : "Upload photo"}</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => void handleFile(e.target.files?.[0])}
            aria-describedby="admin-product-image-upload-help"
          />
        </label>
        <span id="admin-product-image-upload-help" className="text-xs text-muted">
          JPEG, PNG or WebP. Saved as WebP, at most 1600px and 5 MB.
        </span>
      </div>

      {(busy || preview) && (
        <div className="flex items-center gap-3">
          {preview && <img src={preview} alt="Photo being uploaded" className="w-12 h-16 object-cover rounded-xs border border-line" />}
          {busy && (
            <div className="flex-1 min-w-0" role="status" aria-live="polite">
              <div className="text-xs text-muted mb-1">
                {stage === "preparing" ? "Preparing photo…" : `Uploading… ${Math.round(progress * 100)}%`}
              </div>
              <progress
                className="w-full h-1.5 accent-[var(--color-maroon-600)]"
                max={1}
                value={stage === "preparing" ? undefined : progress}
                aria-label="Photo upload progress"
              />
            </div>
          )}
        </div>
      )}

      {message && (
        <p className={stage === "error" ? "field-error" : "field-help !text-success"} role={stage === "error" ? "alert" : "status"}>
          {message}
        </p>
      )}
    </div>
  );
}
