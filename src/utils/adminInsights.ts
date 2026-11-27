/**
 * Figures and labels for the admin dashboard, worked out from the orders and products it
 * has already loaded (nothing here reads or writes the database).
 */

import type { Order, Product } from "../types";
import { getSizeOptionsFor } from "./sizes.ts";

type Tone = "success" | "warning" | "danger" | "neutral";

/** How an order is being paid, in a few words, with a badge colour */
export function orderPaymentLabel(order: Pick<Order, "paymentMethod" | "paymentStatus">): { label: string; tone: Tone } {
  if (order.paymentMethod === "Razorpay") {
    switch (order.paymentStatus) {
      case "Paid":
        return { label: "Paid online", tone: "success" };
      case "Awaiting payment":
        return { label: "Awaiting payment", tone: "warning" };
      case "Unpaid":
        return { label: "Unpaid", tone: "neutral" };
      case "Refund Pending":
        return { label: "Refund pending", tone: "warning" };
      case "Refunded":
        return { label: "Refunded", tone: "neutral" };
    }
  }
  switch (order.paymentStatus) {
    case "Paid":
      return { label: "Paid (COD)", tone: "success" };
    case "Refunded":
      return { label: "Refunded", tone: "neutral" };
    default:
      return { label: "COD due", tone: "neutral" };
  }
}

export const ORDER_STATUSES: Order["status"][] = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled", "Returned"];

/** Orders in each status */
export function orderStatusCounts(orders: Pick<Order, "status">[]): Record<Order["status"], number> {
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<Order["status"], number>;
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
  return counts;
}

// An order counts as a sale unless it was cancelled or returned, or is an online order not paid for
const isSale = (o: Pick<Order, "status" | "paymentStatus">) =>
  o.status !== "Cancelled" && o.status !== "Returned" && o.paymentStatus !== "Awaiting payment" && o.paymentStatus !== "Unpaid";

/**
 * Sales in the last 7 days and since the 1st of this month (India time, the boutique's
 * clock), counting only orders that are sales (see isSale).
 */
export function salesSummary(
  orders: Pick<Order, "createdAt" | "status" | "paymentStatus" | "total">[],
  now: Date = new Date()
): { week: { count: number; total: number }; month: { count: number; total: number } } {
  const IST_MS = 330 * 60 * 1000;
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const india = new Date(now.getTime() + IST_MS);
  const monthStart = Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), 1) - IST_MS;
  const week = { count: 0, total: 0 };
  const month = { count: 0, total: 0 };
  for (const o of orders) {
    if (!isSale(o)) continue;
    const at = new Date(o.createdAt).getTime();
    if (Number.isNaN(at)) continue;
    if (at >= weekStart) {
      week.count += 1;
      week.total += o.total;
    }
    if (at >= monthStart) {
      month.count += 1;
      month.total += o.total;
    }
  }
  return { week, month };
}

/** Sizes with `threshold` or fewer left, sold-out first, for pieces the shop offers in that size */
export function lowStockSizes(
  products: Product[],
  threshold = 1
): { product: Product; size: string; quantity: number }[] {
  return products
    .flatMap((product) =>
      getSizeOptionsFor(product.category).map((size) => ({ product, size, quantity: product.sizeStock?.[size] ?? 0 }))
    )
    .filter((row) => row.quantity <= threshold)
    .sort((a, b) => a.quantity - b.quantity || a.product.name.localeCompare(b.product.name));
}

/** Orders that need the boutique to do something */
export function ordersNeedingAttention(orders: Pick<Order, "status" | "paymentMethod" | "paymentStatus">[]) {
  return {
    // New orders to confirm (an online order only once it is paid)
    toConfirm: orders.filter((o) => o.status === "Pending" && o.paymentStatus !== "Awaiting payment").length,
    // Online orders started but not paid: their pieces are held until cancelled
    awaitingPayment: orders.filter((o) => o.status === "Pending" && o.paymentStatus === "Awaiting payment").length,
    // Confirmed orders not yet shipped
    toShip: orders.filter((o) => o.status === "Confirmed").length,
    // Cancelled online orders still holding the customer's money
    toRefund: orders.filter((o) => o.paymentMethod === "Razorpay" && o.status === "Cancelled" && o.paymentStatus === "Paid").length,
  };
}

/** Orders that used each coupon code (cancelled and returned orders left out) */
export function couponUsage(orders: Pick<Order, "couponCode" | "status">[]): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const o of orders) {
    if (!o.couponCode || o.status === "Cancelled" || o.status === "Returned") continue;
    const code = o.couponCode.toUpperCase();
    usage[code] = (usage[code] ?? 0) + 1;
  }
  return usage;
}

/** WhatsApp chat with the customer about their order (a 10-digit Indian mobile number) */
export function customerWhatsAppUrl(order: Pick<Order, "customerPhone" | "customerName" | "reference">, brandName: string): string {
  const digits = order.customerPhone.replace(/\D/g, "").slice(-10);
  const text = `Namaste ${order.customerName}, this is ${brandName} about your order ${order.reference}.`;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

/** tel: link for the customer's phone */
export const customerPhoneHref = (order: Pick<Order, "customerPhone">) => `tel:+91${order.customerPhone.replace(/\D/g, "").slice(-10)}`;
