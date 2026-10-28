import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { 
  X, ShieldCheck, Box, ClipboardList, RefreshCw, PlusCircle, 
  Trash2, DollarSign, Activity, Eye, BarChart2, Tag, 
  Settings, Key, Smartphone, Users, Lock, ChevronDown, Check, AlertCircle 
} from "lucide-react";
import { Product, Order, Category, OfflineSale, Offer, AnalyticsData } from "../types";

interface BoutiqueManagerProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  orders: Order[];
  categories: Category[];
  onProductsUpdate: (products: Product[]) => void;
  onOrdersUpdate: (orders: Order[]) => void;
  onCategoriesUpdate: (categories: Category[]) => void;
  preAuthenticated?: boolean;
}

export default function BoutiqueManager({
  isOpen,
  onClose,
  products,
  orders,
  categories,
  onProductsUpdate,
  onOrdersUpdate,
  onCategoriesUpdate,
  preAuthenticated = false,
}: BoutiqueManagerProps) {
  // Authentication status
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>("");
  const [loginError, setLoginError] = useState<string>("");

  // Tabs
  const [activeTab, setActiveTab] = useState<"analytics" | "fulfillment" | "inventory" | "catalogue" | "offers">("analytics");

  // Local administrative states
  const [offlineSales, setOfflineSales] = useState<OfflineSale[]>([]);
  const [offersList, setOffersList] = useState<Offer[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Form states for Add Product
  const [newProdName, setNewProdName] = useState("");
  const [newProdDesc, setNewProdDesc] = useState("");
  const [newProdCat, setNewProdCat] = useState("");
  const [newProdSubcat, setNewProdSubcat] = useState("");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdSalePrice, setNewProdSalePrice] = useState("");
  const [newProdImg, setNewProdImg] = useState("");
  const [newProdStockS, setNewProdStockS] = useState("5");
  const [newProdStockM, setNewProdStockM] = useState("5");
  const [newProdStockL, setNewProdStockL] = useState("5");
  const [newProdStockXL, setNewProdStockXL] = useState("5");
  const [newProdStockFS, setNewProdStockFS] = useState("0"); // For sarees
  const [prodFormMsg, setProdFormMsg] = useState("");

  // Form states for Add Category
  const [newCatName, setNewCatName] = useState("");
  const [newCatSubcats, setNewCatSubcats] = useState("");
  const [catFormMsg, setCatFormMsg] = useState("");

  // Form states for Add Coupon
  const [newCouponTitle, setNewCouponTitle] = useState("");
  const [newCouponCode, setNewCouponCode] = useState("");
  const [newCouponValue, setNewCouponValue] = useState("");
  const [newCouponType, setNewCouponType] = useState<"percent" | "flat">("percent");
  const [newCouponMin, setNewCouponMin] = useState("");
  const [couponFormMsg, setCouponFormMsg] = useState("");

  // Form states for Record Offline Sale
  const [offlineProdId, setOfflineProdId] = useState("");
  const [offlineSize, setOfflineSize] = useState("");
  const [offlineQty, setOfflineQty] = useState("1");
  const [offlinePrice, setOfflinePrice] = useState("");
  const [offlineFormMsg, setOfflineFormMsg] = useState("");

  // Loading triggers
  const [actionLoading, setActionLoading] = useState<string>("");

  useEffect(() => {
    if (preAuthenticated) {
      setIsAuthenticated(true);
    }
  }, [preAuthenticated]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchAdminData();
    }
  }, [isOpen, isAuthenticated]);

  const fetchAdminData = async () => {
    try {
      const [salesRes, offersRes, analyticsRes] = await Promise.all([
        fetch("/api/sales/offline"),
        fetch("/api/offers"),
        fetch("/api/analytics")
      ]);

      if (salesRes.ok) setOfflineSales(await salesRes.json());
      if (offersRes.ok) setOffersList(await offersRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch (err) {
      console.error("Error loading secure admin records:", err);
    }
  };

  // Handle Admin Authorization
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === "3825") {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("Invalid administrative password credentials.");
    }
  };

  // Restock Size-Specific Variant
  const handleRestockSize = async (productId: string, size: string, qty: number) => {
    setActionLoading(`${productId}-${size}`);
    try {
      const res = await fetch("/api/inventory/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, size, quantity: qty })
      });
      if (res.ok) {
        const data = await res.json();
        onProductsUpdate(data.products);
        fetchAdminData();
      }
    } catch (err) {
      console.error("Restock request failed:", err);
    } finally {
      setActionLoading("");
    }
  };

  // Record Offline / Instagram Sale
  const handleRecordOfflineSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offlineProdId || !offlineSize || !offlineQty) {
      setOfflineFormMsg("Please select product, size variant and sale quantity.");
      return;
    }

    setOfflineFormMsg("");
    const matchingProduct = products.find(p => p.id === offlineProdId);
    if (!matchingProduct) return;

    try {
      const res = await fetch("/api/sales/offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: offlineProdId,
          size: offlineSize,
          quantity: Number(offlineQty),
          salePrice: offlinePrice ? Number(offlinePrice) : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setOfflineFormMsg(data.error || "Failed to record manual transaction.");
      } else {
        onProductsUpdate(data.products);
        setOfflineSales(data.offlineSales);
        setOfflineQty("1");
        setOfflinePrice("");
        setOfflineFormMsg("Instagram/Offline Sale logged successfully! Stock decremented.");
        fetchAdminData();
      }
    } catch (err) {
      setOfflineFormMsg("Failed to communicate sale request.");
    }
  };

  // Update Customer Order Status
  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    setActionLoading(`order-${orderId}-${status}`);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const data = await res.json();
        onOrdersUpdate(data.orders);
        fetchAdminData();
      }
    } catch (err) {
      console.error("Status update request failed:", err);
    } finally {
      setActionLoading("");
    }
  };

  // Toggle Product enabled vs disabled status
  const handleToggleProductStatus = async (product: Product) => {
    const nextStatus = product.status === "enabled" ? "disabled" : "enabled";
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        const data = await res.json();
        onProductsUpdate(data.products);
      }
    } catch (err) {
      console.error("Failed to toggle listing status:", err);
    }
  };

  // Add Product Submit
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName || !newProdDesc || !newProdCat || !newProdPrice) {
      setProdFormMsg("Please enter product name, description, category and price.");
      return;
    }

    const sizeStockMap: Record<string, number> = {};
    if (newProdCat === "Sarees") {
      sizeStockMap["FS"] = Number(newProdStockFS) || 10;
    } else {
      sizeStockMap["S"] = Number(newProdStockS) || 0;
      sizeStockMap["M"] = Number(newProdStockM) || 0;
      sizeStockMap["L"] = Number(newProdStockL) || 0;
      sizeStockMap["XL"] = Number(newProdStockXL) || 0;
    }

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProdName,
          description: newProdDesc,
          category: newProdCat,
          subcategory: newProdSubcat || undefined,
          price: Number(newProdPrice),
          salePrice: newProdSalePrice ? Number(newProdSalePrice) : undefined,
          image: newProdImg || "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dwde10fa80/images/ss26/skdasrt32417ss26tur_1.jpg?sw=650&sh=975&q=100&strip=false",
          sizeStock: sizeStockMap
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setProdFormMsg(data.error || "Failed to create product listing.");
      } else {
        onProductsUpdate(data.products);
        setNewProdName("");
        setNewProdDesc("");
        setNewProdSubcat("");
        setNewProdPrice("");
        setNewProdSalePrice("");
        setNewProdImg("");
        setProdFormMsg("Boutique product listing published successfully!");
      }
    } catch (err) {
      setProdFormMsg("Failed to add product listing.");
    }
  };

  // Add Category Submit
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const subcatsArray = newCatSubcats.split(",").map(s => s.trim()).filter(Boolean);

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName, subcategories: subcatsArray })
      });
      const data = await res.json();
      if (!res.ok) {
        setCatFormMsg(data.error || "Failed to add category.");
      } else {
        onCategoriesUpdate(data.categories);
        setNewCatName("");
        setNewCatSubcats("");
        setCatFormMsg(`Category "${newCatName}" added successfully.`);
      }
    } catch (err) {
      setCatFormMsg("Failed to create category.");
    }
  };

  // Add Coupon Submit
  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponTitle || !newCouponCode || !newCouponValue) return;

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newCouponTitle,
          code: newCouponCode,
          discountValue: Number(newCouponValue),
          type: newCouponType,
          minSpend: newCouponMin ? Number(newCouponMin) : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponFormMsg(data.error || "Failed to add coupon.");
      } else {
        setOffersList(data.offers);
        setNewCouponTitle("");
        setNewCouponCode("");
        setNewCouponValue("");
        setNewCouponMin("");
        setCouponFormMsg("Promo coupon issued successfully!");
      }
    } catch (err) {
      setCouponFormMsg("Failed to create coupon.");
    }
  };

  // Toggle Coupon Enabled Status
  const handleToggleOffer = async (offer: Offer) => {
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !offer.enabled })
      });
      if (res.ok) {
        const data = await res.json();
        setOffersList(data.offers);
      }
    } catch (err) {
      console.error("Failed to toggle coupon:", err);
    }
  };

  // Delete Offer Coupon
  const handleDeleteOffer = async (id: string) => {
    if (!confirm("Are you sure you want to delete this coupon?")) return;
    try {
      const res = await fetch(`/api/offers/${id}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setOffersList(data.offers);
      }
    } catch (err) {
      console.error("Failed to delete coupon:", err);
    }
  };

  // Delete Product completely
  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this outfit from the database?")) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        onProductsUpdate(data.products);
      }
    } catch (err) {
      console.error("Failed to delete product:", err);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this category? This might make related products uncategorized.")) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        onCategoriesUpdate(data.categories);
      }
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  };

  // Dynamic Statistics Calculations (Orders + Offline manual transactions)
  const statsSummary = useMemo(() => {
    const ordersTotal = orders.reduce((sum, o) => o.status !== "Cancelled" ? sum + o.total : sum, 0);
    const offlineTotal = offlineSales.reduce((sum, s) => sum + s.price * s.quantity, 0);
    const combinedRevenue = ordersTotal + offlineTotal;

    const completedShipmentsCount = orders.filter(o => o.status === "Delivered").length;
    const pendingFulfillCount = orders.filter(o => o.status === "Pending" || o.status === "Confirmed").length;

    // Calculate low stock counts
    let lowStockCount = 0;
    products.forEach(p => {
      const tot = (Object.values(p.sizeStock || {}) as number[]).reduce((a, b) => a + b, 0);
      if (tot <= 4) lowStockCount++;
    });

    return {
      revenue: combinedRevenue,
      onlineSales: ordersTotal,
      offlineSales: offlineTotal,
      totalOrdersCount: orders.length + offlineSales.length,
      pendingFulfill: pendingFulfillCount,
      completedOrders: completedShipmentsCount,
      lowStock: lowStockCount
    };
  }, [products, orders, offlineSales]);

  // Size details helper
  const getProductTotalStockStr = (product: Product): string => {
    if (!product.sizeStock) return "0";
    return Object.entries(product.sizeStock)
      .map(([size, stock]) => `${size}:${stock}`)
      .join(", ");
  };

  if (!isOpen) return null;

  return (
    <div className="min-h-screen bg-brand-cream text-brand-charcoal font-sans flex flex-col" id="boutique-manager-root">
      
      {/* Main Admin Panel Container */}
      <div className="flex flex-col flex-1" id="manager-card">
        
        {/* Header bar */}
        <div className="px-6 py-4.5 border-b border-brand-border flex items-center justify-between bg-brand-beige/30" id="manager-header">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-brand-accent" />
            <div>
              <h2 className="text-base font-serif font-semibold text-brand-charcoal flex items-center space-x-2">
                <span>ALANKRITHA</span>
                <span className="text-[9px] font-sans font-bold bg-brand-accent text-brand-cream px-1.5 py-0.5 rounded tracking-widest uppercase">
                  Staff Workspace
                </span>
              </h2>
              <p className="text-[10px] text-brand-muted font-light font-sans">Family-owned Home Boutique Warehouse Inventory & Logistics Hub.</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full hover:bg-[#052F1E] bg-brand-charcoal text-brand-cream text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer"
            id="close-manager-btn"
          >
            ← Back to Storefront
          </button>
        </div>

        {/* ====================================================
           SECURITY PASSWORD GATE
           ==================================================== */}
        {!isAuthenticated ? (
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center bg-brand-beige/5 flex-1 min-h-[350px]" id="secure-login-gate">
            <motion.div 
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
              className="max-w-md w-full bg-brand-cream p-6 rounded-xl border border-brand-border shadow-md space-y-5 text-center font-sans"
            >
              <div className="w-12 h-12 rounded-full bg-brand-beige flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5 text-brand-accent" />
              </div>
              
              <div className="space-y-1.5">
                <h3 className="font-serif text-lg font-bold text-brand-charcoal">Authorized Entry Only</h3>
                <p className="text-xs text-brand-muted leading-relaxed">
                  Enter your Alankritha staff passcode to access order fulfillment, manual offline inventory sales, and pricing managers.
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-left">
                {loginError && (
                  <div className="text-[10px] text-rose-700 font-semibold bg-rose-50 border border-rose-100 p-2.5 rounded flex items-center space-x-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}
                
                <div>
                  <label className="text-[10px] font-bold text-brand-muted uppercase block mb-1">Staff Password</label>
                  <div className="relative flex items-center">
                    <Key className="w-4 h-4 text-brand-muted absolute left-3" />
                    <input
                      type="password"
                      required
                      placeholder="Enter password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-brand-cream border border-brand-border rounded px-3 pl-9 py-2 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-brand-charcoal hover:bg-brand-accent text-brand-cream py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Authorization</span>
                </button>
              </form>

              <div className="text-[9px] text-brand-muted italic border-t border-brand-border/40 pt-3">
                Security notice: Unauthorized login attempts will be logged in container analytics.
              </div>
            </motion.div>
          </div>
        ) : (
          /* ====================================================
             AUTHORIZED CONTROL PANEL CONTENT
             ==================================================== */
          <>
            <div className="flex flex-col md:flex-row flex-1 animate-fade-in" id="manager-workspace-layout">
              {/* Admin Sidebar */}
              <div className="w-full md:w-64 bg-brand-cream border-r border-brand-border shrink-0 flex flex-col justify-between" id="manager-sidebar">
                <div className="p-5 space-y-6">
                  {/* Quick stats brief */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-[#9D825E] tracking-[0.25em] uppercase">Staff Portal</span>
                    <h3 className="text-xs font-serif font-bold text-brand-charcoal tracking-wider uppercase">Control Center</h3>
                  </div>

                  {/* Nav links */}
                  <div className="space-y-1.5">
                    <button
                      onClick={() => setActiveTab("analytics")}
                      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
                        activeTab === "analytics" ? "bg-brand-charcoal text-brand-cream font-bold" : "text-brand-muted hover:text-brand-charcoal hover:bg-brand-beige/25 font-medium"
                      }`}
                    >
                      <BarChart2 className="w-3.5 h-3.5 text-[#9D825E]" />
                      <span>Boutique Analytics</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("fulfillment")}
                      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
                        activeTab === "fulfillment" ? "bg-brand-charcoal text-brand-cream font-bold" : "text-brand-muted hover:text-brand-charcoal hover:bg-brand-beige/25 font-medium"
                      }`}
                    >
                      <ClipboardList className="w-3.5 h-3.5 text-[#9D825E]" />
                      <span>Logistics ({orders.length})</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("inventory")}
                      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
                        activeTab === "inventory" ? "bg-brand-charcoal text-brand-cream font-bold" : "text-brand-muted hover:text-brand-charcoal hover:bg-brand-beige/25 font-medium"
                      }`}
                    >
                      <Box className="w-3.5 h-3.5 text-[#9D825E]" />
                      <span>Offline Sales ({offlineSales.length})</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("catalogue")}
                      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
                        activeTab === "catalogue" ? "bg-brand-charcoal text-brand-cream font-bold" : "text-brand-muted hover:text-brand-charcoal hover:bg-brand-beige/25 font-medium"
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5 text-[#9D825E]" />
                      <span>Manage Wardrobe</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("offers")}
                      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
                        activeTab === "offers" ? "bg-brand-charcoal text-brand-cream font-bold" : "text-brand-muted hover:text-brand-charcoal hover:bg-brand-beige/25 font-medium"
                      }`}
                    >
                      <Tag className="w-3.5 h-3.5 text-[#9D825E]" />
                      <span>Coupons Desk ({offersList.length})</span>
                    </button>
                  </div>
                </div>

                <div className="p-5 border-t border-brand-border/40 text-[9px] text-brand-muted uppercase tracking-widest font-semibold hidden md:block">
                  Alankritha Workspace v1.4
                </div>
              </div>

              {/* Tab content desk area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6" id="manager-content-area">

              {/* 1. ANALYTICS & STATS TAB */}
              {activeTab === "analytics" && (
                <div className="space-y-6 animate-fade-in font-sans">
                  
                  {/* Grid Counters */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="stats-counters-grid">
                    <div className="bg-brand-cream border border-brand-border/60 rounded p-4 shadow-3xs">
                      <div className="flex justify-between items-center text-brand-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Combined Revenue</span>
                        <DollarSign className="w-4 h-4 text-brand-accent" />
                      </div>
                      <p className="text-xl font-bold text-brand-charcoal mt-1.5 font-sans">
                        ₹{statsSummary.revenue.toLocaleString("en-IN")}
                      </p>
                      <p className="text-[9px] text-brand-muted font-light mt-0.5">
                        Online: ₹{statsSummary.onlineSales.toLocaleString("en-IN")} | Offline: ₹{statsSummary.offlineSales.toLocaleString("en-IN")}
                      </p>
                    </div>

                    <div className="bg-brand-cream border border-brand-border/60 rounded p-4 shadow-3xs">
                      <div className="flex justify-between items-center text-brand-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Total Sales count</span>
                        <Activity className="w-4 h-4 text-brand-accent" />
                      </div>
                      <p className="text-xl font-bold text-brand-charcoal mt-1.5 font-sans">
                        {statsSummary.totalOrdersCount}
                      </p>
                      <p className="text-[9px] text-brand-muted font-light mt-0.5">
                        Online: {orders.length} | Offline sales: {offlineSales.length}
                      </p>
                    </div>

                    <div className="bg-brand-cream border border-brand-border/60 rounded p-4 shadow-3xs">
                      <div className="flex justify-between items-center text-brand-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Pending Shipments</span>
                        <ClipboardList className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="text-xl font-bold text-amber-700 mt-1.5 font-sans">
                        {statsSummary.pendingFulfill}
                      </p>
                      <p className="text-[9px] text-brand-muted font-light mt-0.5">
                        Requires courier dispatch and tracking ID.
                      </p>
                    </div>

                    <div className="bg-brand-cream border border-brand-border/60 rounded p-4 shadow-3xs">
                      <div className="flex justify-between items-center text-brand-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Low Stock Outfits</span>
                        <Box className="w-4 h-4 text-rose-600 animate-pulse" />
                      </div>
                      <p className="text-xl font-bold text-rose-700 mt-1.5 font-sans">
                        {statsSummary.lowStock}
                      </p>
                      <p className="text-[9px] text-brand-muted font-light mt-0.5">
                        Outfits with 4 or fewer pieces across sizes.
                      </p>
                    </div>
                  </div>

                  {/* Visual charts mapping mock analytics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Traffic Source Channels Chart */}
                    <div className="bg-brand-cream border border-brand-border/60 p-5 rounded space-y-4 shadow-3xs">
                      <div className="flex items-center space-x-2 text-brand-charcoal font-serif font-bold text-xs">
                        <Users className="w-4 h-4 text-brand-accent" />
                        <span>Visitor Traffic Sources</span>
                      </div>
                      <div className="space-y-2.5 font-sans">
                        {analytics && Object.entries(analytics.trafficSources || {}).map(([src, count]) => {
                          const maxCount = Math.max(...(Object.values(analytics.trafficSources) as number[]));
                          const countNum = Number(count);
                          const percent = Math.min(100, Math.round((countNum / (maxCount || 1)) * 100));
                          return (
                            <div key={src} className="space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="font-semibold text-brand-charcoal">{src} Channel</span>
                                <span className="text-brand-muted font-bold">{countNum} visits</span>
                              </div>
                              <div className="w-full h-2 bg-brand-beige rounded-full overflow-hidden">
                                <div className="h-full bg-brand-accent rounded-full" style={{ width: `${percent}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Best Selling Apparel Products */}
                    <div className="bg-brand-cream border border-brand-border/60 p-5 rounded space-y-4 shadow-3xs">
                      <div className="flex items-center space-x-2 text-brand-charcoal font-serif font-bold text-xs">
                        <Smartphone className="w-4 h-4 text-brand-accent" />
                        <span>Device split</span>
                      </div>
                      <div className="space-y-2.5 font-sans">
                        {analytics && Object.entries(analytics.devices || {}).map(([dev, count]) => {
                          const sumDev = (Object.values(analytics.devices) as number[]).reduce((a, b) => a + b, 0);
                          const devCountNum = Number(count);
                          const percent = Math.round((devCountNum / (sumDev || 1)) * 100);
                          return (
                            <div key={dev} className="space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="font-semibold text-brand-charcoal">{dev} Visits</span>
                                <span className="text-brand-muted font-bold">{percent}% ({count} clicks)</span>
                              </div>
                              <div className="w-full h-2 bg-brand-beige rounded-full overflow-hidden">
                                <div className="h-full bg-brand-charcoal rounded-full" style={{ width: `${percent}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                  {/* Best Selling table summary */}
                  <div className="bg-brand-cream border border-brand-border/60 p-5 rounded shadow-3xs">
                    <h3 className="text-xs font-serif font-bold text-brand-charcoal mb-3">Best-Selling Collections (Online & Offline Sales)</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-brand-beige/20 uppercase tracking-wider text-[9px] font-bold text-brand-muted border-b border-brand-border/40">
                          <tr>
                            <th className="py-2">Outfit Name</th>
                            <th className="py-2">Category</th>
                            <th className="py-2 text-right">Selling Price</th>
                            <th className="py-2 text-center">Variant Stocks Remaining</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/30 font-light">
                          {products.slice(0, 4).map(p => (
                            <tr key={p.id}>
                              <td className="py-2.5 font-semibold text-brand-charcoal">{p.name}</td>
                              <td className="py-2.5 text-brand-muted">{p.category}</td>
                              <td className="py-2.5 text-right font-sans">₹{(p.salePrice || p.price).toLocaleString("en-IN")}</td>
                              <td className="py-2.5 text-center font-sans text-[10px] font-semibold text-brand-accent">
                                {getProductTotalStockStr(p)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* 2. LOGISTICS & fulfillment BOARD TAB */}
              {activeTab === "fulfillment" && (
                <div className="space-y-4 animate-fade-in font-sans">
                  <div className="bg-brand-beige/20 p-3 rounded border border-brand-border/60 text-xs text-brand-muted font-light leading-relaxed">
                    Review and dispatch customer orders below. Advancing status confirms immediate updates and triggers beautifully formatted client confirmation letters.
                  </div>

                  {orders.length === 0 ? (
                    <div className="text-center py-16 bg-brand-cream border border-dashed border-brand-border rounded-xl flex flex-col items-center justify-center space-y-3">
                      <ClipboardList className="w-8 h-8 text-brand-border" />
                      <p className="text-xs text-brand-muted italic">No online customer orders have been received yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {[...orders].reverse().map((o) => {
                        const loadingShip = actionLoading === `order-${o.id}-Shipped`;
                        const loadingDelv = actionLoading === `order-${o.id}-Delivered`;
                        const loadingCan = actionLoading === `order-${o.id}-Cancelled`;

                        return (
                          <div key={o.id} className="border border-brand-border rounded p-4 bg-brand-cream shadow-2xs space-y-3">
                            {/* Title bar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-brand-border/40 pb-2.5 gap-2 text-xs font-sans">
                              <div>
                                <span className="font-bold text-brand-charcoal text-sm">Order #{o.id}</span>
                                <span className="text-[10px] text-brand-muted block mt-0.5">
                                  Placed: {o.date} at {o.time} | Recipient: <strong>{o.customerName}</strong> (+91 {o.customerPhone})
                                </span>
                              </div>
                              <div className="flex items-center space-x-2 shrink-0">
                                <span className="font-bold text-brand-accent">₹{o.total.toLocaleString("en-IN")}</span>
                                <span className="text-[10px] bg-brand-beige px-2 py-0.5 rounded font-bold uppercase">
                                  {o.paymentMethod === "COD" ? "Cash on Delivery" : "Prepaid"}
                                </span>
                                
                                {/* Status badge */}
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                  o.status === "Pending" ? "bg-amber-50 border border-amber-100 text-amber-700" :
                                  o.status === "Shipped" ? "bg-blue-50 border border-blue-100 text-blue-700" :
                                  o.status === "Delivered" ? "bg-emerald-50 border border-emerald-100 text-emerald-800" :
                                  "bg-zinc-100 border border-zinc-200 text-zinc-600"
                                }`}>
                                  {o.status}
                                </span>
                              </div>
                            </div>

                            {/* Details parameters */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-light font-sans">
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-brand-muted uppercase block">Purchased Items</span>
                                {o.items.map((it, idx) => (
                                  <p key={idx} className="text-brand-charcoal">
                                    • {it.name} <strong className="font-semibold text-brand-accent">({it.selectedSize})</strong> x {it.quantity} — ₹{(it.price * it.quantity).toLocaleString("en-IN")}
                                  </p>
                                ))}
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-brand-muted uppercase block">Delivery Location</span>
                                <p className="text-brand-charcoal leading-relaxed font-light">
                                  {o.address}, {o.city}, {o.state} - <strong>{o.pincode}</strong>
                                </p>
                                <p className="text-[10px] text-brand-muted">Email: {o.customerEmail}</p>
                              </div>
                            </div>

                            {/* Logistical timeline modifiers */}
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-brand-border/40 text-xs">
                              <span className="text-[10px] font-bold uppercase text-brand-muted mr-1">Logistics:</span>
                              
                              {/* Confirm / Ship */}
                              {o.status === "Pending" && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, "Shipped")}
                                  disabled={loadingShip}
                                  className="px-3.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] uppercase font-bold cursor-pointer transition-colors"
                                >
                                  {loadingShip ? "Processing..." : "Confirm & Ship Courier"}
                                </button>
                              )}

                              {/* Deliver */}
                              {o.status === "Shipped" && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, "Delivered")}
                                  disabled={loadingDelv}
                                  className="px-3.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] uppercase font-bold cursor-pointer transition-colors"
                                >
                                  {loadingDelv ? "Processing..." : "Mark as Delivered"}
                                </button>
                              )}

                              {/* Cancel */}
                              {o.status !== "Delivered" && o.status !== "Cancelled" && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, "Cancelled")}
                                  disabled={loadingCan}
                                  className="px-3.5 py-1 border border-rose-300 hover:bg-rose-50 text-rose-700 rounded text-[10px] uppercase font-bold cursor-pointer transition-colors"
                                >
                                  {loadingCan ? "Cancelling..." : "Cancel Order"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

              {/* 3. INSTAGRAM & OFFLINE SALES MANAGER */}
              {activeTab === "inventory" && (
                <div className="space-y-6 animate-fade-in font-sans">
                  
                  {/* Record Offline Sale Widget Form */}
                  <div className="bg-brand-cream border border-brand-border/60 p-5 rounded shadow-3xs space-y-4">
                    <div className="flex items-center space-x-1.5 font-serif font-bold text-xs text-brand-charcoal">
                      <PlusCircle className="w-4 h-4 text-brand-accent" />
                      <span>Log Instagram / WhatsApp Offline Sale</span>
                    </div>

                    {offlineFormMsg && (
                      <p className="text-[11px] font-semibold text-brand-accent bg-brand-beige/40 p-2 rounded">
                        {offlineFormMsg}
                      </p>
                    )}

                    <form onSubmit={handleRecordOfflineSale} className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 items-end">
                      {/* Select product */}
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Select Outfit</label>
                        <select
                          required
                          value={offlineProdId}
                          onChange={(e) => {
                            setOfflineProdId(e.target.value);
                            setOfflineSize("");
                          }}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent cursor-pointer"
                        >
                          <option value="">-- Choose Outfit --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Select size */}
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Select Size</label>
                        <select
                          required
                          disabled={!offlineProdId}
                          value={offlineSize}
                          onChange={(e) => setOfflineSize(e.target.value)}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent cursor-pointer disabled:opacity-40"
                        >
                          <option value="">-- Size --</option>
                          {offlineProdId && Object.entries(products.find(p => p.id === offlineProdId)?.sizeStock || {}).map(([size, stock]) => (
                            <option key={size} value={size}>{size} ({stock} left)</option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Sale Quantity</label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={offlineQty}
                          onChange={(e) => setOfflineQty(e.target.value)}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent font-sans"
                        />
                      </div>

                      {/* Price override */}
                      <div>
                        <button
                          type="submit"
                          className="w-full bg-brand-charcoal hover:bg-brand-accent text-brand-cream py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                        >
                          Record Offline Sale
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Offline Sales Log Table */}
                  <div className="bg-brand-cream border border-brand-border/60 rounded p-5 shadow-3xs space-y-3">
                    <h3 className="font-serif font-bold text-xs text-brand-charcoal">Instagram / WhatsApp Offline Transactions History</h3>
                    
                    {offlineSales.length === 0 ? (
                      <p className="text-xs text-brand-muted italic leading-relaxed pt-2">No manual offline transactions logged yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs text-left">
                          <thead className="bg-brand-beige/20 text-brand-muted font-bold text-[9px] uppercase border-b border-brand-border/40">
                            <tr>
                              <th className="py-2">Transaction ID</th>
                              <th className="py-2">Outfit Name</th>
                              <th className="py-2 text-center">Size</th>
                              <th className="py-2 text-center">Qty Sold</th>
                              <th className="py-2 text-right">Sold price</th>
                              <th className="py-2 text-center">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border/30 font-light">
                            {[...offlineSales].reverse().map(s => (
                              <tr key={s.id}>
                                <td className="py-2 font-mono text-[10px] text-brand-accent">#{s.id.slice(-6).toUpperCase()}</td>
                                <td className="py-2 font-semibold text-brand-charcoal">{s.productName}</td>
                                <td className="py-2 text-center font-bold text-brand-charcoal">{s.size}</td>
                                <td className="py-2 text-center font-bold">{s.quantity}</td>
                                <td className="py-2 text-right font-sans">₹{s.price.toLocaleString("en-IN")}</td>
                                <td className="py-2 text-center text-[10px] text-brand-muted">{s.date}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* 4. MANAGE WARDROBE CATALOGUE EDITOR */}
              {activeTab === "catalogue" && (
                <div className="space-y-6 animate-fade-in font-sans">
                  
                  {/* Category Editor Widget */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Add Category Form */}
                    <div className="bg-brand-cream border border-brand-border/60 p-5 rounded shadow-3xs space-y-4">
                      <h3 className="font-serif font-bold text-xs text-brand-charcoal">Create New Category</h3>
                      
                      {catFormMsg && (
                        <p className="text-[10px] font-semibold text-brand-accent bg-brand-beige/30 p-2 rounded">
                          {catFormMsg}
                        </p>
                      )}

                      <form onSubmit={handleAddCategory} className="space-y-3.5">
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Category Name</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Anarkalis"
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Subcategories (comma-separated)</label>
                          <input
                            type="text"
                            placeholder="e.g. Georgette, Cotton, Festive Silk"
                            value={newCatSubcats}
                            onChange={(e) => setNewCatSubcats(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-brand-charcoal hover:bg-brand-accent text-brand-cream py-2 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Create Category
                        </button>
                      </form>
                    </div>

                    {/* Category List & Delete */}
                    <div className="bg-brand-cream border border-brand-border/60 p-5 rounded shadow-3xs space-y-3">
                      <h3 className="font-serif font-bold text-xs text-brand-charcoal">Categories List</h3>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {categories.map((c) => (
                          <div key={c.id} className="flex justify-between items-center text-xs border-b border-brand-border/30 pb-2">
                            <div>
                              <span className="font-semibold text-brand-charcoal">{c.name}</span>
                              {c.subcategories && c.subcategories.length > 0 && (
                                <p className="text-[9px] text-brand-muted">Types: {c.subcategories.join(", ")}</p>
                              )}
                            </div>
                            {c.name !== "Kurtas" && c.name !== "Sarees" && c.name !== "Co-ord Sets" && (
                              <button
                                onClick={() => handleDeleteCategory(c.id)}
                                className="text-brand-muted hover:text-rose-700 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Product Listing Addition Form */}
                  <div className="bg-brand-cream border border-brand-border/60 p-5 rounded shadow-3xs space-y-4">
                    <h3 className="font-serif font-bold text-xs text-brand-charcoal">Publish New Apparel Listing</h3>
                    
                    {prodFormMsg && (
                      <p className="text-[11px] font-semibold text-brand-accent bg-brand-beige/30 p-2.5 rounded">
                        {prodFormMsg}
                      </p>
                    )}

                    <form onSubmit={handleAddProduct} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Apparel Name</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Radhika Organza Saree"
                            value={newProdName}
                            onChange={(e) => setNewProdName(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Choose Category</label>
                          <select
                            required
                            value={newProdCat}
                            onChange={(e) => setNewProdCat(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent cursor-pointer"
                          >
                            <option value="">-- Choose Category --</option>
                            {categories.map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Subcategory / Subdivision</label>
                          <input
                            type="text"
                            placeholder="e.g. Straight Fit, Organza, Katan Silk"
                            value={newProdSubcat}
                            onChange={(e) => setNewProdSubcat(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Original Price (INR)</label>
                          <input
                            type="number"
                            required
                            placeholder="Original retail price"
                            value={newProdPrice}
                            onChange={(e) => setNewProdPrice(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent font-sans"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Promotional Discount Price (INR, Optional)</label>
                          <input
                            type="number"
                            placeholder="Sale price if active"
                            value={newProdSalePrice}
                            onChange={(e) => setNewProdSalePrice(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent font-sans"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Unsplash/Imagery URL</label>
                          <input
                            type="text"
                            placeholder="https://images.unsplash.com/..."
                            value={newProdImg}
                            onChange={(e) => setNewProdImg(e.target.value)}
                            className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent"
                          />
                        </div>
                      </div>

                      {/* Size-specific stock fields based on selected category */}
                      <div className="bg-brand-beige/25 p-3.5 rounded border border-brand-border/40">
                        {newProdCat === "Sarees" ? (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-charcoal block mb-2">Free Size Saree stock levels</span>
                            <div className="flex items-center space-x-3 text-xs">
                              <span className="font-bold">Free Size (One Size fits all) Stock:</span>
                              <input
                                type="number"
                                min={0}
                                value={newProdStockFS}
                                onChange={(e) => setNewProdStockFS(e.target.value)}
                                className="w-20 bg-brand-cream border border-brand-border rounded px-2.5 py-1 text-xs font-sans text-center text-brand-charcoal focus:outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-charcoal block mb-2">Indicate stocks per Size variant</span>
                            <div className="grid grid-cols-4 gap-3 text-xs">
                              <div>
                                <label className="text-[9px] text-brand-muted block font-semibold mb-1">Size S Stock</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={newProdStockS}
                                  onChange={(e) => setNewProdStockS(e.target.value)}
                                  className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1 text-center font-sans focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-brand-muted block font-semibold mb-1">Size M Stock</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={newProdStockM}
                                  onChange={(e) => setNewProdStockM(e.target.value)}
                                  className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1 text-center font-sans focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-brand-muted block font-semibold mb-1">Size L Stock</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={newProdStockL}
                                  onChange={(e) => setNewProdStockL(e.target.value)}
                                  className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1 text-center font-sans focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-brand-muted block font-semibold mb-1">Size XL Stock</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={newProdStockXL}
                                  onChange={(e) => setNewProdStockXL(e.target.value)}
                                  className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1 text-center font-sans focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Outfit Description & fabrics meta</label>
                        <textarea
                          required
                          rows={2}
                          placeholder="Provide descriptive details regarding weaver pedigree, zari density or care..."
                          value={newProdDesc}
                          onChange={(e) => setNewProdDesc(e.target.value)}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs text-brand-charcoal focus:ring-1 focus:ring-brand-accent resize-none focus:outline-none"
                        ></textarea>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-brand-charcoal hover:bg-brand-accent text-brand-cream text-xs font-semibold uppercase tracking-wider rounded transition-colors cursor-pointer"
                      >
                        Publish Apparel Listing
                      </button>
                    </form>
                  </div>

                  {/* Wardrobe Catalogue management list table */}
                  <div className="bg-brand-cream border border-brand-border/60 rounded p-5 shadow-3xs space-y-3">
                    <h3 className="font-serif font-bold text-xs text-brand-charcoal">Active Apparel Catalogue Management</h3>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-brand-beige/20 text-brand-muted font-bold text-[9px] uppercase border-b border-brand-border/40">
                          <tr>
                            <th className="py-2.5 pl-3">Apparel Name</th>
                            <th className="py-2.5 text-center">Category</th>
                            <th className="py-2.5 text-right">Retail Price</th>
                            <th className="py-2.5 text-center">Variant Stocks</th>
                            <th className="py-2.5 text-center">Store Status</th>
                            <th className="py-2.5 text-center">Catalogue Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/30 font-light font-sans">
                          {products.map(p => {
                            const tot = Object.values(p.sizeStock || {}).reduce((a, b) => a + b, 0);
                            return (
                              <tr key={p.id} className="hover:bg-brand-beige/5">
                                <td className="py-3 pl-3 flex items-center space-x-2.5 font-semibold text-brand-charcoal">
                                  <div className="w-6 aspect-[3/4] overflow-hidden rounded bg-transparent shrink-0">
                                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" loading="eager" decoding="async" />
                                  </div>
                                  <span className="line-clamp-1">{p.name}</span>
                                </td>
                                <td className="py-3 text-center text-brand-muted">{p.category}</td>
                                <td className="py-3 text-right">₹{p.price.toLocaleString("en-IN")}</td>
                                <td className="py-3 text-center text-[10px] text-brand-accent font-semibold">{getProductTotalStockStr(p)}</td>
                                <td className="py-3 text-center">
                                  <button
                                    onClick={() => handleToggleProductStatus(p)}
                                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      p.status === "enabled" ? "bg-emerald-50 border border-emerald-100 text-emerald-800" : "bg-rose-50 border border-rose-100 text-rose-700"
                                    }`}
                                  >
                                    {p.status === "enabled" ? "Active" : "Disabled"}
                                  </button>
                                </td>
                                <td className="py-3 text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    {/* Direct size replenishment restock buttons */}
                                    <button
                                      onClick={() => handleRestockSize(p.id, Object.keys(p.sizeStock)[0] || "S", 5)}
                                      disabled={actionLoading === `${p.id}-${Object.keys(p.sizeStock)[0] || "S"}`}
                                      className="px-2 py-0.5 bg-brand-beige hover:bg-brand-border/40 text-[9px] font-bold rounded"
                                    >
                                      +5 Stock
                                    </button>
                                    
                                    <button
                                      onClick={() => handleDeleteProduct(p.id)}
                                      className="text-brand-muted hover:text-rose-700 p-1 rounded-full hover:bg-rose-50"
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

              {/* 5. COUPONS & PROMOTIONS TAB */}
              {activeTab === "offers" && (
                <div className="space-y-6 animate-fade-in font-sans">
                  
                  {/* Create New Coupon form */}
                  <div className="bg-brand-cream border border-brand-border/60 p-5 rounded shadow-3xs space-y-4">
                    <h3 className="font-serif font-bold text-xs text-brand-charcoal">Issue Promotional Coupon Code</h3>
                    
                    {couponFormMsg && (
                      <p className="text-[10px] font-semibold text-brand-accent bg-brand-beige/30 p-2 rounded">
                        {couponFormMsg}
                      </p>
                    )}

                    <form onSubmit={handleAddCoupon} className="grid grid-cols-1 sm:grid-cols-5 gap-3.5 items-end">
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Coupon Title</label>
                        <input
                          type="text"
                          required
                          placeholder="Festive Offer"
                          value={newCouponTitle}
                          onChange={(e) => setNewCouponTitle(e.target.value)}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-brand-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Promo Code</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. DIWALI20"
                          value={newCouponCode}
                          onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs uppercase font-sans focus:ring-1 focus:ring-brand-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Discount Value</label>
                        <input
                          type="number"
                          required
                          placeholder="e.g. 10 or 500"
                          value={newCouponValue}
                          onChange={(e) => setNewCouponValue(e.target.value)}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs font-sans focus:ring-1 focus:ring-brand-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Discount Type</label>
                        <select
                          value={newCouponType}
                          onChange={(e) => setNewCouponType(e.target.value as "percent" | "flat")}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-brand-accent focus:outline-none"
                        >
                          <option value="percent">Percentage %</option>
                          <option value="flat">Flat Rupees ₹</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-brand-muted uppercase block mb-1">Min Spend (INR, Optional)</label>
                        <input
                          type="number"
                          placeholder="e.g. 1500"
                          value={newCouponMin}
                          onChange={(e) => setNewCouponMin(e.target.value)}
                          className="w-full bg-brand-cream border border-brand-border rounded px-2.5 py-1.5 text-xs font-sans focus:ring-1 focus:ring-brand-accent focus:outline-none"
                        />
                      </div>
                    </form>

                    <button
                      onClick={handleAddCoupon}
                      className="w-full py-2 bg-brand-charcoal hover:bg-brand-accent text-brand-cream rounded text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Issue Coupon
                    </button>
                  </div>

                  {/* Active Coupons table */}
                  <div className="bg-brand-cream border border-brand-border/60 rounded p-5 shadow-3xs space-y-3">
                    <h3 className="font-serif font-bold text-xs text-brand-charcoal">Active Promotional Coupon Catalog</h3>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-brand-beige/20 text-brand-muted font-bold text-[9px] uppercase border-b border-brand-border/40">
                          <tr>
                            <th className="py-2.5 pl-3">Coupon Slogan</th>
                            <th className="py-2.5 text-center">Promo Code</th>
                            <th className="py-2.5 text-center">Deduction Value</th>
                            <th className="py-2.5 text-center">Min Spend Target</th>
                            <th className="py-2.5 text-center">Status</th>
                            <th className="py-2.5 text-center">Coupons Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/30 font-light font-sans">
                          {offersList.map(off => (
                            <tr key={off.id} className="hover:bg-brand-beige/5">
                              <td className="py-3 pl-3 font-semibold text-brand-charcoal">{off.title}</td>
                              <td className="py-3 text-center font-bold text-brand-accent tracking-wider">{off.code}</td>
                              <td className="py-3 text-center font-bold text-brand-charcoal">
                                {off.type === "percent" ? `${off.discountValue}% Off` : `₹${off.discountValue.toLocaleString("en-IN")} Off`}
                              </td>
                              <td className="py-3 text-center">
                                {off.minSpend ? `₹${off.minSpend.toLocaleString("en-IN")}` : "No Minimum"}
                              </td>
                              <td className="py-3 text-center">
                                <button
                                  onClick={() => handleToggleOffer(off)}
                                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    off.enabled ? "bg-emerald-50 border border-emerald-100 text-emerald-800" : "bg-rose-50 border border-rose-100 text-rose-700"
                                  }`}
                                >
                                  {off.enabled ? "Active" : "Disabled"}
                                </button>
                              </td>
                              <td className="py-3 text-center">
                                <button
                                  onClick={() => handleDeleteOffer(off.id)}
                                  className="text-brand-muted hover:text-rose-700 p-1 rounded-full hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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

              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
