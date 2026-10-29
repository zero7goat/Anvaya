export type CollectionType = "alankritha" | "ayanaa";

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
  verified: boolean;
  brandReply?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  collection?: CollectionType; // 'alankritha' for Kurtas, 'ayanaa' for Sarees
  category: string; // "Kurtas" | "Sarees"
  subcategory?: string;
  price: number; // Original price
  salePrice?: number; // Discounted promotional price (optional)
  image: string;
  additionalImages?: string[]; // Image gallery
  sizeStock: Record<string, number>; // Individual stock per size: kurtas {"S": 3, ..., "XXL": 0}, sarees {"Free Size": 6}
  reviews: Review[];
  isFeatured: boolean;
  isNewArrival: boolean;
  status: "enabled" | "disabled"; // Toggle product display / published status
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  collection?: CollectionType;
  subcategories?: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize: string;
}

export interface Order {
  id: string;
  items: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    selectedSize: string;
    collection?: CollectionType;
  }[];
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  // Price breakdown, as recorded by the database (public.orders)
  subtotal?: number;
  discount?: number;
  couponCode?: string;
  shippingCost?: number;
  total: number;
  // Shown to customers and on WhatsApp: ANV-XXXXXXXXXX. For orders read by an admin,
  // id is the database row id (needed for status changes); otherwise it equals reference.
  // Every order read from the database has reference and createdAt; they are optional
  // only for the old Express server (server.ts), which the site doesn't use.
  reference?: string;
  createdAt?: string; // ISO timestamp from the database
  date: string; // YYYY-MM-DD (India time)
  time: string; // HH:MM (India time)
  paymentMethod: "COD";
  paymentStatus: "COD - Due" | "Paid" | "Refunded";
  status: "Pending" | "Confirmed" | "Shipped" | "Delivered" | "Cancelled" | "Returned";
  // Used only by server.ts
  emailContent?: string;
  whatsappContent?: string;
}

export interface OfflineSale {
  id: string;
  productId: string;
  productName: string;
  size: string;
  quantity: number;
  price: number;
  date: string; // YYYY-MM-DD
}

export interface Offer {
  id: string;
  title: string;
  code: string;
  discountValue: number; // Percentage or flat amount
  type: "percent" | "flat";
  enabled: boolean;
  minSpend?: number;
}

export interface AnalyticsData {
  visitors: number;
  pageViews: number;
  productViews: number;
  popularProducts: Record<string, number>; // productId -> count
  trafficSources: Record<string, number>; // source -> count
  devices: Record<string, number>; // device -> count
}
