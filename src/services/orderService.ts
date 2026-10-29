import type { Order } from "../types";
import { BOUTIQUE_CONFIG } from "../config";
import { FREE_SIZE } from "../utils/sizes";

/**
 * WhatsApp links for the boutique. Orders themselves are recorded only by the database
 * (see ./orderApi.ts); the order message is built from an order the database has
 * already saved, so WhatsApp is a notification, never the order itself.
 */
const whatsappUrl = (text: string) => `https://wa.me/${BOUTIQUE_CONFIG.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

export const orderService = {
  /**
   * WhatsApp link for a question about one product (optionally a chosen size).
   * Same message as the original product-detail modal.
   */
  generateWhatsAppProductEnquiryUrl(productName: string, selectedSize?: string): string {
    const text = `Namaste ALANKRITHA! I am interested in inquiring about the "${productName}"${
      selectedSize ? ` in ${selectedSize === FREE_SIZE ? FREE_SIZE : `Size "${selectedSize}"`}` : ""
    }. Could you please share more details or photos? Thank you!`;
    return whatsappUrl(text);
  },

  /**
   * WhatsApp link asking for help after online checkout didn't go through. It carries no
   * order details and says plainly that it is not an order.
   */
  generateWhatsAppCheckoutHelpUrl(): string {
    return whatsappUrl(
      `Namaste ${BOUTIQUE_CONFIG.brandName}! I tried to place an order on the website but it didn't go through. This message is not an order; could you please help me?`
    );
  },

  /**
   * The message and wa.me link for an order the database has saved, with its reference
   * and the database's own figures.
   */
  generateWhatsAppOrderUrl(params: {
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
    orderReference: string;
  }): { message: string; url: string } {
    const itemLines = params.items.map(
      (item, idx) => `${idx + 1}. *${item.name}*\n   Size: ${item.selectedSize} | Qty: ${item.quantity} | ₹${item.price.toLocaleString("en-IN")}`
    ).join("\n\n");

    const message = `Namaste *${BOUTIQUE_CONFIG.brandName}*,

I have placed an order on the website (Reference: #${params.orderReference}):

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

    return { message, url: whatsappUrl(message) };
  },

  /** The order message link for a saved order */
  whatsAppUrlForOrder(order: Order): string {
    return this.generateWhatsAppOrderUrl({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: order.address,
      city: order.city,
      state: order.state,
      pincode: order.pincode,
      items: order.items.map((it) => ({ name: it.name, selectedSize: it.selectedSize, quantity: it.quantity, price: it.price })),
      subtotal: order.subtotal ?? order.items.reduce((sum, it) => sum + it.price * it.quantity, 0),
      discount: order.discount,
      couponCode: order.couponCode,
      shippingCost: order.shippingCost ?? 0,
      grandTotal: order.total,
      orderReference: order.reference,
    }).url;
  },
};
