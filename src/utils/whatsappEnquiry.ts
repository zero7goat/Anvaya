import type { CartItem } from "../types";
import { getUnitPrice } from "./pricing.ts";

const rupees = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

/**
 * The WhatsApp message for an order enquiry. Orders are placed in the chat: the boutique
 * confirms availability, the final amount and payment there, so nothing is saved on the
 * website and these figures are only what the shopper saw in the bag.
 */
export function buildOrderEnquiry(params: {
  brandName: string;
  items: CartItem[];
  subtotal: number;
  discount?: number;
  couponCode?: string;
  total: number;
}): string {
  const itemLines = params.items
    .map(
      ({ product, selectedSize, quantity }, i) =>
        `${i + 1}. *${product.name}*\n   Code: ${product.id.toUpperCase()} | Size: ${selectedSize} | Qty: ${quantity} | ${rupees(getUnitPrice(product) * quantity)}`
    )
    .join("\n");

  return [
    `Namaste *${params.brandName}*! I would like to order:`,
    "",
    itemLines,
    "",
    `Subtotal: ${rupees(params.subtotal)}`,
    ...(params.discount ? [`Coupon${params.couponCode ? ` ${params.couponCode}` : ""}: -${rupees(params.discount)}`] : []),
    "Shipping: Free",
    `*Total: ${rupees(params.total)}*`,
    "",
    "Please confirm availability and how to pay.",
    "",
    "My name:",
    "Delivery address with PIN code:",
  ].join("\n");
}
