import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OVERLAY_MOTION } from "../utils/motion";
import { X, Mail, MailOpen, Calendar, User, ShoppingBag } from "lucide-react";
import { Order } from "../types";

interface InboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onMarkRead: (orderId: string) => void;
}

// Simple and high-fidelity custom Markdown renderer to parse headers, bolding, lists, and horizontal dividers
function MarkdownEmailRenderer({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");

  return (
    <div className="space-y-3 text-xs text-ink font-sans leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // 1. Horizontal Rules
        if (trimmed === "---") {
          return <hr key={idx} className="border-t border-line/60 my-4" />;
        }

        // 2. Main Headers (# Title)
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={idx} className="heading-card pt-3 pb-1 border-b border-line">
              {trimmed.slice(2)}
            </h1>
          );
        }

        // 3. Sub-Headers (### Sub)
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={idx} className="eyebrow pt-4 pb-1">
              {trimmed.slice(4)}
            </h3>
          );
        }

        // 4. Bullet Lists
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const rawText = trimmed.slice(2);
          return (
            <div key={idx} className="flex items-start pl-3 my-1">
              <span className="text-accent mr-2 font-bold">•</span>
              <span>{parseBoldText(rawText)}</span>
            </div>
          );
        }

        // 5. Empty Lines
        if (trimmed === "") {
          return <div key={idx} className="h-2" />;
        }

        // 6. Default Paragraphs
        return (
          <p key={idx} className="font-light">
            {parseBoldText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

// Utility to parse inline **bold text**
function parseBoldText(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-bold text-ink">{part}</strong>;
    }
    return part;
  });
}

export default function InboxDrawer({
  isOpen,
  onClose,
  orders,
  onMarkRead,
}: InboxDrawerProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Sorting orders to display most recent at top
  const sortedOrders = [...orders].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    onMarkRead(order.id);
  };

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div key="inbox-drawer" {...OVERLAY_MOTION.backdrop} className="fixed inset-0 z-50 overflow-hidden" id="inbox-drawer-root">
      {/* Backdrop */}
      <div
        className="overlay-backdrop absolute"
        onClick={onClose}
        id="inbox-backdrop"
      ></div>

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10" id="inbox-slider-container">
        <motion.div
          {...OVERLAY_MOTION.drawerRight}
          className="w-screen max-w-2xl bg-canvas flex flex-col h-full shadow-2xl"
          id="inbox-card"
        >
          {/* Header */}
          <div className="px-4 py-4 sm:px-6 border-b border-line flex items-center justify-between bg-surface" id="inbox-header">
            <div className="flex items-center space-x-2">
              <Mail className="w-5 h-5 text-accent" />
              <h2 className="heading-card text-lg sm:text-lg">Style Notifications</h2>
              <span className="badge badge-neutral tabular-nums">
                {orders.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="btn-icon" aria-label="Close notifications"
              id="close-inbox-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden" id="inbox-dual-pane">
            
            {/* Left Pane: Mail List */}
            <div className="w-1/2 border-r border-line/50 overflow-y-auto" id="inbox-mail-list">
              {sortedOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <Mail className="w-8 h-8 text-line" />
                  <p className="text-xs text-muted italic font-light">
                    No status emails found. Your personalized order logs will appear here once you place a request.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line/40">
                  {sortedOrders.map((order) => {
                    const isSelected = selectedOrder?.id === order.id;
                    const formattedDate = new Date(order.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });

                    return (
                      <button
                        key={order.id}
                        onClick={() => handleSelectOrder(order)}
                        className={`w-full text-left p-4 transition-all hover:bg-surface-muted/25 flex flex-col space-y-1.5 border-l-2 cursor-pointer ${
                          isSelected
                            ? "bg-surface-muted/50 border-accent"
                            : "border-transparent"
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="eyebrow">
                            Order #{order.id.slice(-6).toUpperCase()}
                          </span>
                          <span className="text-2xs text-muted">{formattedDate}</span>
                        </div>
                        <h4 className="text-xs font-semibold text-ink line-clamp-1">
                          {order.status === "Pending"
                            ? "Order Confirmation Receipt"
                            : order.status === "Shipped"
                            ? "Your Wardrobe is on the Way!"
                            : "Delivered: Experience the Fit"}
                        </h4>
                        <p className="text-2xs text-muted line-clamp-2 font-light leading-relaxed">
                          Status: <span className="font-bold uppercase tracking-wider text-2xs">{order.status}</span> • To {order.customerName}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Pane: Selected Mail Detail Content */}
            <div className="w-1/2 overflow-y-auto p-5 bg-surface-muted/10" id="inbox-mail-content-pane">
              {selectedOrder ? (
                <div className="space-y-4" id="inbox-selected-email">
                  {/* Sender & Receiver metadata card */}
                  <div className="panel-muted p-4 space-y-1.5 text-xs" id="email-metadata-card">
                    <div className="flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-accent" />
                      <span className="text-muted">From:</span>
                      <strong className="text-ink">AURA & CO. Client Services</strong>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <MailOpen className="w-3.5 h-3.5 text-accent" />
                      <span className="text-muted">To:</span>
                      <strong className="text-ink">{selectedOrder.customerEmail}</strong>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-accent" />
                      <span className="text-muted">Date:</span>
                      <span className="text-ink">{selectedOrder.date}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 pt-1.5 border-t border-line/40">
                      <ShoppingBag className="w-3.5 h-3.5 text-accent" />
                      <span className="text-muted">Order Total:</span>
                      <strong className="text-accent">${selectedOrder.total.toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Render content */}
                  <div className="panel p-5" id="email-body-box">
                    <MarkdownEmailRenderer content={selectedOrder.emailContent || ""} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-muted font-light" id="inbox-empty-detail">
                  <MailOpen className="w-8 h-8 text-line" />
                  <p className="text-xs italic">
                    Select a style notification email from the left pane to view personalized Gemini formatting.
                  </p>
                </div>
              )}
            </div>

          </div>

        </motion.div>
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
