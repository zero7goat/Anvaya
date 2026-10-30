/**
 * NEW-ORDER ALERTS FOR THE ADMIN DASHBOARD
 *
 * Works only while the dashboard is open: it re-reads the orders every minute (no
 * webhooks, bots or other services). Two separate ideas:
 *
 * - "Unseen": orders placed after the admin last looked at the Orders section, remembered
 *   in this browser. These drive the badge and the tab title, including orders that
 *   arrived while the dashboard was closed.
 * - "Fresh": orders that appear between two reads while the dashboard is open. Each one
 *   triggers the optional sound / browser notification once, never again.
 *
 * Lifecycle (see AdminDashboard and hooks/useNewOrderAlerts):
 * - Each sign-in starts a new FreshOrderTracker; the first list read after it is only the
 *   starting point, so orders already there never chime (unseen ones show in the badge).
 * - Signing out clears the orders from memory, ignores reads still on their way and stops
 *   the one-minute timer; leaving the dashboard stops it too.
 * - A status change re-reads the same orders, so it never counts as a new order.
 *
 * Known limit: each open dashboard tab or device keeps its own tracker. With two tabs
 * open, both chime for the same new order; browser notifications share one tag, so the
 * second replaces the first on screen instead of stacking.
 */

export const ORDER_POLL_MS = 60_000;

export interface AlertableOrder {
  id: string;
  reference: string;
  createdAt: string; // ISO timestamp from the database
  total: number;
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** The newest order's createdAt, or undefined for an empty list */
export const newestCreatedAt = (orders: AlertableOrder[]): string | undefined =>
  orders.reduce<AlertableOrder | undefined>((newest, o) => (!newest || time(o.createdAt) > time(newest.createdAt) ? o : newest), undefined)
    ?.createdAt;

/** Orders placed after `seenAt`; without a seenAt nothing is unseen */
export const unseenOrders = (orders: AlertableOrder[], seenAt: string | undefined): AlertableOrder[] =>
  seenAt ? orders.filter((o) => time(o.createdAt) > time(seenAt)) : [];

/**
 * Finds orders that are new since the previous read. The first list read is the starting
 * point (nothing in it is announced), and an order is announced at most once, even if a
 * later read leaves it out and a following one brings it back.
 */
export class FreshOrderTracker {
  private known: Set<string> | null = null;
  private readonly announced = new Set<string>();

  public next(orders: AlertableOrder[]): AlertableOrder[] {
    const ids = new Set(orders.map((o) => o.id));
    if (!this.known) {
      this.known = ids;
      orders.forEach((o) => this.announced.add(o.id));
      return [];
    }
    const fresh = orders.filter((o) => !this.known!.has(o.id) && !this.announced.has(o.id));
    fresh.forEach((o) => this.announced.add(o.id));
    this.known = ids;
    return fresh;
  }
}

/** Tab title with the number of unseen orders in front, e.g. "(2) New orders · ANVAYA Admin" */
export const titleWithCount = (baseTitle: string, unseen: number): string =>
  unseen > 0 ? `(${unseen}) New order${unseen === 1 ? "" : "s"} · ${baseTitle}` : baseTitle;
