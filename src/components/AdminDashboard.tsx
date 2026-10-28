import React, { useState, useEffect, useMemo } from "react";
import { 
  Package, ShoppingBag, AlertTriangle, CheckCircle2, Clock, 
  Search, Plus, Edit2, Trash2, Eye, EyeOff, LogOut, ArrowLeft, 
  Filter, Check, X, RefreshCw, Smartphone, ExternalLink, ShieldCheck,
  ChevronRight, Layers, DollarSign, Store
} from "lucide-react";
import { Product, Order, CollectionType } from "../types";
import { productService } from "../services/productService";
import { orderService } from "../services/orderService";
import { authService, AdminUser } from "../services/authService";
import { BOUTIQUE_CONFIG } from "../config";
import ProductImage from "./ProductImage";
import { FloralSprig } from "./decor/Motifs";
import { BOX_INPUT, DomeBorder, LabelledBox } from "./AuthFormParts";
import { getProductImage } from "../data/imageRegistry";
import { ALL_SIZES, FREE_SIZE, describeSize, getSizeOptions, getSizeOptionsFor } from "../utils/productDisplay";

interface AdminDashboardProps {
  onReturnToStore: () => void;
  onProductsChanged?: () => void;
}

export default function AdminDashboard({ onReturnToStore, onProductsChanged }: AdminDashboardProps) {
  // Authentication state
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(authService.getCurrentUser());
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Dashboard active view
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "inventory" | "orders">("overview");

  // In-memory data states
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // Search & Filter states for products
  const [prodSearch, setProdSearch] = useState("");
  const [prodCategoryFilter, setProdCategoryFilter] = useState("All");
  const [prodCollectionFilter, setProdCollectionFilter] = useState<"All" | "alankritha" | "ayanaa">("All");
  const [prodStatusFilter, setProdStatusFilter] = useState<"All" | "enabled" | "disabled">("All");

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
    sizeStock: { "S": 4, "M": 6, "L": 6, "XL": 2, "XXL": 0 } as Record<string, number>
  });
  const [formError, setFormError] = useState("");

  // Delete Confirmation Dialog state
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Order Details Modal / View
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Load products & orders from services
  const refreshData = () => {
    const prods = productService.getProducts({ includeDisabled: true });
    const ords = orderService.getOrders();
    setProducts(prods);
    setOrders(ords);
    if (onProductsChanged) onProductsChanged();
  };

  useEffect(() => {
    refreshData();
  }, []);

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

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (orderStatusFilter !== "All" && o.status !== orderStatusFilter) return false;
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
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

    const res = await authService.login(loginEmail, loginPassword);
    setLoginLoading(false);
    if (res.success) {
      setCurrentUser(authService.getCurrentUser());
      refreshData();
    } else {
      setLoginError(res.error || "Invalid administrator credentials.");
    }
  };

  // Quick Demo Access for instant testing
  const handleQuickDemoAccess = () => {
    authService.loginDemo();
    setCurrentUser(authService.getCurrentUser());
    refreshData();
  };

  // Handle Logout
  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
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

  // Save product (Create or Update)
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError("Product title is required.");
      return;
    }
    const numPrice = parseFloat(formData.price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setFormError("Please enter a valid retail price.");
      return;
    }
    const numSalePrice = formData.salePrice ? parseFloat(formData.salePrice) : undefined;
    if (numSalePrice !== undefined && numSalePrice >= numPrice) {
      setFormError("Promotional sale price must be lower than the retail price.");
      return;
    }

    // Collection correlates to category
    const targetCollection: CollectionType = formData.category === "Sarees" ? "ayanaa" : "alankritha";

    // Kurtas are stocked in S to XXL, sarees as Free Size
    const cleanStock: Record<string, number> = {};
    getSizeOptionsFor(formData.category).forEach(sz => {
      cleanStock[sz] = Math.max(0, Number(formData.sizeStock[sz]) || 0);
    });

    if (editingProduct) {
      productService.updateProduct(editingProduct.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        collection: targetCollection,
        category: formData.category,
        subcategory: formData.subcategory,
        price: numPrice,
        salePrice: numSalePrice,
        image: formData.image.trim(),
        isFeatured: formData.isFeatured,
        isNewArrival: formData.isNewArrival,
        status: formData.status,
        sizeStock: cleanStock
      });
    } else {
      productService.createProduct({
        name: formData.name.trim(),
        description: formData.description.trim(),
        collection: targetCollection,
        category: formData.category,
        subcategory: formData.subcategory,
        price: numPrice,
        salePrice: numSalePrice,
        image: formData.image.trim(),
        isFeatured: formData.isFeatured,
        isNewArrival: formData.isNewArrival,
        status: formData.status,
        sizeStock: cleanStock
      });
    }

    setIsProductModalOpen(false);
    refreshData();
  };

  // Handle Delete Product Confirmation
  const confirmDeleteProduct = () => {
    if (productToDelete) {
      productService.deleteProduct(productToDelete.id);
      setProductToDelete(null);
      refreshData();
    }
  };

  // Toggle status directly from table
  const handleToggleStatus = (id: string) => {
    productService.toggleProductStatus(id);
    refreshData();
  };

  // Change order status
  const handleChangeOrderStatus = (orderId: string, newStatus: Order["status"]) => {
    orderService.updateOrderStatus(orderId, newStatus);
    refreshData();
    if (selectedOrder && selectedOrder.id === orderId) {
      const updated = orderService.getOrderById(orderId);
      if (updated) setSelectedOrder(updated);
    }
  };

  // Update size inventory directly
  const handleQuickStockChange = (productId: string, size: string, count: number) => {
    productService.updateSizeStock(productId, size, Math.max(0, count));
    refreshData();
  };

  // =========================================================================
  // VIEW 1: ADMIN LOGIN SCREEN (same look as the customer sign-in page)
  // =========================================================================
  if (!currentUser) {
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

            <form onSubmit={handleLogin} className="mt-7 space-y-3" id="admin-login-form">
              {loginError && (
                <div className="status-note status-note-danger" role="alert">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-danger" />
                  <span>{loginError}</span>
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

            {/* Prototype notice */}
            <p className="mt-4 text-center text-sm font-semibold text-ink/70">
              Demo preview: real admin sign-in is not connected yet. Use Quick Demo Access to look around.
            </p>

            {/* Demo access, styled like the customer page's switch button */}
            <div className="flex items-center gap-4 mt-9 mb-4 sm:-mx-5 text-sm uppercase tracking-[0.14em] text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-line-strong" />
              Just testing?
              <span className="h-px flex-1 bg-line-strong" />
            </div>
            <button
              type="button"
              onClick={handleQuickDemoAccess}
              className="w-full h-[56px] sm:h-[60px] flex items-center justify-center gap-3 border border-line-strong bg-surface text-ink text-base transition-colors hover:bg-surface-muted hover:border-ink cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              Quick Demo Access
            </button>

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
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans">
      
      {/* Top Administrative Header */}
      <header className="bg-surface border-b border-line sticky top-0 z-40">
        <div className="container-page">
          <div className="flex items-center justify-between h-16">
            
            {/* Brand Title */}
            <div className="flex items-center space-x-3">
              <img
                src="/images/logo-144.png" width={159} height={144}
                alt="ANVAYA emblem"
                className="h-8 w-auto object-contain shrink-0"
                decoding="async"
              />
              <div>
                <span className="font-serif text-lg tracking-[0.18em] text-ink uppercase">
                  ANVAYA
                </span>
                <span className="eyebrow ml-2 hidden sm:inline">
                  Admin Dashboard
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:inline-flex segmented" role="tablist" aria-label="Dashboard sections">
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
              </button>
            </nav>

            {/* Right: Return to Store & Logout */}
            <div className="flex items-center space-x-3">
              <button
                onClick={onReturnToStore}
                className="hidden sm:inline-flex btn btn-secondary btn-sm"
                title="Open storefront"
              >
                <Store className="w-3.5 h-3.5" />
                <span>View Store</span>
              </button>

              <button
                onClick={handleLogout}
                className="btn btn-ghost btn-sm"
                title="Sign out of admin"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container-page py-8">
        
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
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-neutral-900">
                          {order.customerName} · <span className="text-neutral-400 tabular-nums">{order.id}</span>
                        </div>
                        <div className="text-neutral-500 mt-0.5">
                          {order.items.map(i => `${i.name} (${i.selectedSize})`).join(", ")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-neutral-900 tabular-nums">
                          ₹{order.total.toLocaleString("en-IN")}
                        </div>
                        <span className={`badge mt-1 ${
                          order.status === "Delivered" ? "badge-success" :
                          order.status === "Shipped" ? "badge-neutral" :
                          order.status === "Cancelled" ? "badge-danger" :
                          "badge-warning"
                        }`}>
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
                    <strong>WhatsApp Business:</strong> +91 9620828013
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    <strong>Support:</strong> care@alankrita.com
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
                              onClick={() => handleToggleStatus(p.id)}
                              className={`badge cursor-pointer transition-colors ${
                                isPublished ? "badge-success hover:bg-success-line" : "badge-neutral hover:bg-line"
                              }`}
                            >
                              {isPublished ? "Published" : "Draft / Hidden"}
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
            </div>

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
                    {products.map((p) => {
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
                                  <input
                                    type="number"
                                    min="0"
                                    value={p.sizeStock?.[size] ?? 0}
                                    onChange={(e) => handleQuickStockChange(p.id, size, parseInt(e.target.value) || 0)}
                                    aria-label={`Stock for ${describeSize(size)}`}
                                    className="w-12 text-center text-xs bg-white border border-neutral-300 rounded-xs px-1 py-1.5 sm:py-0.5 focus:outline-none focus:border-neutral-800"
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
                                onClick={() => {
                                  productService.restockProduct(p.id, 5);
                                  refreshData();
                                }}
                                className="btn btn-secondary btn-sm"
                              >
                                +5 All
                              </button>
                              <button
                                onClick={() => {
                                  productService.markOutOfStock(p.id);
                                  refreshData();
                                }}
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

              {/* Status Filter */}
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="field field-sm w-auto"
              >
                <option value="All">All Order Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Shipped">Shipped</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="ds-table ds-table-stack">
                  <thead>
                    <tr>
                      <th className="py-3 px-4">Order ID & Date</th>
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
                          <div className="tabular-nums font-bold text-neutral-900">{o.id}</div>
                          <div className="text-neutral-400 text-xs">{o.date} {o.time}</div>
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
                        </td>
                        <td data-label="Status" className="py-3 px-4">
                          <select
                            value={o.status}
                            onChange={(e) => handleChangeOrderStatus(o.id, e.target.value as any)}
                            className="field field-sm w-auto"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Confirmed">Confirmed</option>
                            <option value="Shipped">Shipped</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </td>
                        <td data-label="Details" className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedOrder(o)}
                            className="btn btn-secondary btn-sm"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                onClick={() => setIsProductModalOpen(false)}
                className="btn-icon btn-icon-sm" aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4">
              {formError && (
                <div className="status-note status-note-danger" role="alert">
                  {formError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="field-label">
                  Product Name / Title *
                </label>
                <input
                  type="text"
                  required
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
                        subcategory: newCat === "Sarees" ? "Banarasi Silk" : "Straight Fit"
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
                    {formData.category === "Kurtas" ? (
                      <>
                        <option value="Straight Fit">Straight Fit</option>
                        <option value="A-Line">A-Line</option>
                        <option value="Anarkali">Anarkali</option>
                      </>
                    ) : (
                      <>
                        <option value="Banarasi Silk">Banarasi Silk</option>
                        <option value="Organza">Organza</option>
                        <option value="Katan Silk">Katan Silk</option>
                      </>
                    )}
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
                  Use a local file in public/images/products (e.g. /images/products/alk-001-front.jpg) or a full URL.
                  Leave empty to show the &ldquo;Image coming soon&rdquo; placeholder. Files mapped in
                  src/data/imageRegistry.ts take priority.
                </p>
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
                        value={formData.sizeStock[sz] ?? 0}
                        onChange={(e) => setFormData({
                          ...formData,
                          sizeStock: { ...formData.sizeStock, [sz]: parseInt(e.target.value) || 0 }
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

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Save Product
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
              Are you sure you want to delete <strong>"{productToDelete.name}"</strong>? This will remove it from the boutique catalogue.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => setProductToDelete(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProduct}
                className="btn btn-danger"
              >
                Yes, Delete
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
                <h3 className="heading-card text-lg sm:text-lg">
                  Order #{selectedOrder.id}
                </h3>
                <p className="text-xs text-neutral-500">
                  {selectedOrder.date} at {selectedOrder.time} · {selectedOrder.paymentMethod}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="btn-icon btn-icon-sm" aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Customer Info */}
              <div className="panel-muted p-3">
                <div className="font-bold text-neutral-900">{selectedOrder.customerName}</div>
                <div className="text-neutral-600 mt-0.5">{selectedOrder.customerPhone} · {selectedOrder.customerEmail}</div>
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
                <div className="bg-surface-muted p-3 flex justify-between font-semibold text-ink border-t border-line">
                  <span>Total Amount (COD):</span>
                  <span className="tabular-nums">₹{selectedOrder.total.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Fulfillment Status */}
              <div>
                <label className="field-label">
                  Change Fulfillment Status
                </label>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => handleChangeOrderStatus(selectedOrder.id, e.target.value as any)}
                  className="field"
                >
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-3 bg-canvas border-t border-line flex justify-end">
              <button
                onClick={() => setSelectedOrder(null)}
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
