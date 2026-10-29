import { Fragment, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OVERLAY_MOTION } from "../utils/motion";
import { X, Package, MessageSquare } from "lucide-react";
import { Order } from "../types";
import { orderService } from "../services/orderService";
import { formatINR } from "../utils/productDisplay";
import { useOverlay } from "../hooks/useOverlay";

interface InboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Only the orders this shopper placed in this browser during this visit
  orders: Order[];
}

const STATUS_TONE: Record<Order["status"], string> = {
  Pending: "badge-warning",
  Confirmed: "badge-success",
  Shipped: "badge-success",
  Delivered: "badge-success",
  Cancelled: "badge-danger",
  Returned: "badge-neutral",
};

/**
 * "Order updates": the orders the shopper placed during this visit, newest first, as
 * the database confirmed them (reference, pieces, sizes, totals). The boutique already
 * has each one; sending it on WhatsApp as well is optional. Customers can't read orders
 * back from the database, so the status shown is the one at the time of ordering.
 */
export default function InboxDrawer({ isOpen, onClose, orders }: InboxDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(isOpen, onClose, panelRef);

  const sortedOrders = [...orders].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="inbox-drawer" {...OVERLAY_MOTION.backdrop} className="fixed inset-0 z-50 overflow-hidden" id="inbox-drawer-root">
          <div className="overlay-backdrop absolute" onClick={onClose} id="inbox-backdrop" />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10" id="inbox-slider-container">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="inbox-title"
              tabIndex={-1}
              {...OVERLAY_MOTION.drawerRight}
              className="w-[calc(100vw-2.5rem)] max-w-md bg-canvas flex flex-col h-full shadow-2xl outline-none"
              id="inbox-card"
            >
              <div className="px-4 py-4 sm:px-6 border-b border-line flex items-center justify-between gap-3 bg-surface" id="inbox-header">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-accent" aria-hidden="true" />
                  <h2 id="inbox-title" className="heading-card text-lg sm:text-lg">
                    Your Orders
                  </h2>
                  {orders.length > 0 && <span className="badge badge-neutral tabular-nums">{orders.length}</span>}
                </div>
                <button onClick={onClose} className="btn-icon" aria-label="Close order updates" id="close-inbox-btn">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4" id="inbox-order-list">
                {sortedOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4">
                    <Package className="w-9 h-9 text-line-strong" aria-hidden="true" />
                    <p className="text-sm text-muted leading-relaxed max-w-xs">
                      Orders you place during this visit appear here, with their status.
                    </p>
                  </div>
                ) : (
                  sortedOrders.map((order) => (
                    <Fragment key={order.id}>
                      <OrderCard order={order} />
                    </Fragment>
                  ))
                )}
              </div>

              <p className="px-4 sm:px-6 py-3 border-t border-line text-xs text-muted bg-surface">
                These orders are saved with the boutique. Sending one on WhatsApp is optional and helps the team confirm it sooner.
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OrderCard({ order }: { order: Order }) {
  const url = orderService.whatsAppUrlForOrder(order);

  return (
    <article className="panel p-4 space-y-3 text-sm" aria-labelledby={`order-${order.id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`order-${order.id}-title`} className="font-semibold text-ink tabular-nums">
          Order #{order.reference}
        </h3>
        <span className={`badge ${STATUS_TONE[order.status] || "badge-neutral"}`}>{order.status} when placed</span>
      </div>
      <p className="text-xs text-muted tabular-nums">
        Placed {order.date} at {order.time} · Cash on Delivery
      </p>

      <ul className="space-y-1.5 border-y border-line py-3">
        {order.items.map((it) => (
          <li key={`${it.productId}-${it.selectedSize}`} className="flex justify-between gap-3 text-xs">
            <span className="min-w-0 text-ink">
              {it.name}
              <span className="block text-muted">
                Size {it.selectedSize} · Qty {it.quantity}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatINR(it.price * it.quantity)}</span>
          </li>
        ))}
      </ul>

      <dl className="space-y-1 text-xs">
        {order.discount ? (
          <div className="flex justify-between text-success">
            <dt>Coupon{order.couponCode ? ` ${order.couponCode}` : ""}</dt>
            <dd className="tabular-nums">-{formatINR(order.discount)}</dd>
          </div>
        ) : null}
        {order.shippingCost !== undefined && (
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd className="tabular-nums">{order.shippingCost === 0 ? "Free" : formatINR(order.shippingCost)}</dd>
          </div>
        )}
        <div className="flex justify-between font-semibold text-ink">
          <dt>Total due on delivery</dt>
          <dd className="tabular-nums">{formatINR(order.total)}</dd>
        </div>
      </dl>

      <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-sm btn-block">
        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
        Also send on WhatsApp (optional)
      </a>
    </article>
  );
}
