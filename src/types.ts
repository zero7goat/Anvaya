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
  sizeStock: Record<string, number>; // Individual stock per size, e.g. {"S": 3, "M": 5, "L": 2, "XL": 4}
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
  total: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  paymentMethod: "COD" | "Razorpay Simulation";
  paymentStatus: "Pending" | "Paid" | "COD - Due";
  status: "Pending" | "Confirmed" | "Shipped" | "Delivered" | "Cancelled" | "Returned";
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
