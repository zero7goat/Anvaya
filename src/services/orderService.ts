import { Order } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { FREE_SIZE } from "../utils/sizes";

/**
 * SAMPLE ORDERS FOR ALANKRITHA BOUTIQUE (DEMO STATE)
 * 
 * Populated with realistic Indian addresses, customer details, and order statuses
 * to demonstrate the Admin Order Management interface before Cloudflare D1 connection.
 */
export const INITIAL_SAMPLE_ORDERS: Order[] = [
  {
    id: "ALK-928104",
    customerName: "Aadhya Sharma",
    customerPhone: "+91 98450 12345",
    customerEmail: "aadhya.sharma@example.com",
    address: "Flat 402, Shanti Vihar Apartments, 12th Main, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
    items: [
      {
        productId: "alk-001",
        name: "Turquoise Cotton Floral Printed Straight Kurta",
        price: 2519,
        quantity: 1,
        selectedSize: "M"
      }
    ],
    total: 2519,
    date: "2026-10-24",
    time: "14:22",
    paymentMethod: "COD",
    paymentStatus: "COD - Due",
    status: "Confirmed"
  },
  {
    id: "ALK-819402",
    customerName: "Pooja Hegde",
    customerPhone: "+91 97412 88990",
    customerEmail: "pooja.hegde@example.com",
    address: "House #54, Gandhi Nagar 3rd Cross",
    city: "Ballari",
    state: "Karnataka",
    pincode: "583101",
    items: [
      {
        productId: "alk-005",
        name: "Royal Mayura Banarasi Katan Silk Saree",
        price: 7499,
        quantity: 1,
        selectedSize: "Free Size"
      }
    ],
    total: 7499,
    date: "2026-10-25",
    time: "11:05",
    paymentMethod: "COD",
    paymentStatus: "Paid",
    status: "Delivered"
  },
  {
    id: "ALK-710294",
    customerName: "Deepika Rao",
    customerPhone: "+91 99801 44221",
    customerEmail: "deepika.rao@example.com",
    address: "B-201, Green Glen Layout, Bellandur",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560103",
    items: [
      {
        productId: "alk-007",
        name: "Mustard Yellow Silk Chanderi Embroidered Kurta",
        price: 3499,
        quantity: 1,
        selectedSize: "L"
      },
      {
        productId: "alk-004",
        name: "Emerald Pine Cotton Chevron Printed Kurta",
        price: 2079,
        quantity: 1,
        selectedSize: "L"
      }
    ],
    total: 4078,
    date: "2026-10-26",
    time: "09:40",
    paymentMethod: "COD",
    paymentStatus: "COD - Due",
    status: "Pending"
  }
];

class OrderService {
  private orders: Order[];

  constructor() {
    this.orders = [...INITIAL_SAMPLE_ORDERS];
  }

  /**
   * Get all orders
   */
  public getOrders(): Order[] {
    return [...this.orders];
  }

  /**
   * Get order by ID
   */
  public getOrderById(id: string): Order | null {
    const found = this.orders.find(o => o.id === id);
    return found ? { ...found } : null;
  }

  /**
   * Create new order in frontend state
   */
  public createOrder(orderData: Omit<Order, "id" | "date" | "time">): Order {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const timeStr = today.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    // Random reference, re-drawn until it does not clash with an existing order
    let orderId = "";
    do {
      orderId = `ALK-${Math.floor(100000 + Math.random() * 900000)}`;
    } while (this.orders.some(o => o.id === orderId));

    const newOrder: Order = {
      ...orderData,
      id: orderId,
      date: dateStr,
      time: timeStr
    };

    this.orders = [newOrder, ...this.orders];
    return { ...newOrder };
  }

  /**
   * Update order status (Pending, Confirmed, Shipped, Delivered, Cancelled)
   */
  public updateOrderStatus(id: string, status: Order["status"]): Order | null {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return null;

    const updated = {
      ...this.orders[index],
      status,
      paymentStatus: status === "Delivered" ? ("Paid" as const) : this.orders[index].paymentStatus
    };

    this.orders = [
      ...this.orders.slice(0, index),
      updated,
      ...this.orders.slice(index + 1)
    ];

    return { ...updated };
  }

  /**
   * WhatsApp link for a question about one product (optionally a chosen size).
   * Same message as the original product-detail modal.
   */
  public generateWhatsAppProductEnquiryUrl(productName: string, selectedSize?: string): string {
    const text = `Namaste ALANKRITHA! I am interested in inquiring about the "${productName}"${
      selectedSize ? ` in ${selectedSize === FREE_SIZE ? FREE_SIZE : `Size "${selectedSize}"`}` : ""
    }. Could you please share more details or photos? Thank you!`;
    const cleanPhone = BOUTIQUE_CONFIG.whatsappNumber.replace(/\D/g, "");
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  /**
   * Format a clean WhatsApp order inquiry message and return the wa.me URL
   */
  public generateWhatsAppOrderUrl(params: {
    customerName: string;
    customerPhone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    items: { name: string; selectedSize: string; quantity: number; price: number }[];
    subtotal: number;
    discount?: number;
    couponCode?: string;
    shippingCost: number;
    grandTotal: number;
    orderId?: string;
  }): { message: string; url: string } {
    const itemLines = params.items.map(
      (item, idx) => `${idx + 1}. *${item.name}*\n   Size: ${item.selectedSize} | Qty: ${item.quantity} | ₹${item.price.toLocaleString("en-IN")}`
    ).join("\n\n");

    const message = `Namaste *${BOUTIQUE_CONFIG.brandName}*,

I would like to place an order${params.orderId ? ` (Reference: #${params.orderId})` : ""}:

🛍️ *ORDER ITEMS:*
${itemLines}

💰 *PRICE BREAKDOWN:*
• Subtotal: ₹${params.subtotal.toLocaleString("en-IN")}${
      params.discount ? `\n• Coupon${params.couponCode ? ` ${params.couponCode}` : ""}: -₹${params.discount.toLocaleString("en-IN")}` : ""
    }
• Delivery: ${params.shippingCost === 0 ? "FREE" : `₹${params.shippingCost}`}
• *Grand Total: ₹${params.grandTotal.toLocaleString("en-IN")}*

📦 *DELIVERY DETAILS:*
• Name: ${params.customerName}
• Phone: ${params.customerPhone}
• Address: ${params.address}
• City/State: ${params.city}, ${params.state}
• PIN Code: ${params.pincode}
• Payment Method: Cash on Delivery (COD)

Please confirm my order and share estimated dispatch details. Thank you!`.trim();

    const cleanPhone = BOUTIQUE_CONFIG.whatsappNumber.replace(/\D/g, "");
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    return { message, url };
  }
}

export const orderService = new OrderService();
