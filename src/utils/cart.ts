import type { CartItem, Product } from "../types";

/**
 * Cart rules as pure functions: every change returns a new array of new items (never
 * edits an item in place, which React may run twice), and quantities always stay
 * between 1 and the stock left in the chosen size.
 */

export const stockFor = (product: Product, size: string) => Math.max(0, product.sizeStock?.[size] || 0);

const sameLine = (item: CartItem, productId: string, size: string) =>
  item.product.id === productId && item.selectedSize === size;

export function addCartItem(cart: CartItem[], product: Product, size: string, quantity: number): CartItem[] {
  const max = stockFor(product, size);
  if (max <= 0 || quantity <= 0) return cart;
  const existing = cart.find((item) => sameLine(item, product.id, size));
  if (existing) {
    const next = Math.min(max, existing.quantity + quantity);
    return cart.map((item) => (item === existing ? { ...item, product, quantity: next } : item));
  }
  return [...cart, { product, selectedSize: size, quantity: Math.min(max, quantity) }];
}

export function setCartItemQuantity(cart: CartItem[], product: Product, size: string, quantity: number): CartItem[] {
  const max = stockFor(product, size);
  return cart.map((item) =>
    sameLine(item, product.id, size) ? { ...item, product, quantity: Math.max(1, Math.min(max, quantity)) } : item
  );
}

export function removeCartItem(cart: CartItem[], productId: string, size: string): CartItem[] {
  return cart.filter((item) => !sameLine(item, productId, size));
}

// What is kept in the browser between visits: references only, never prices or stock
export interface StoredCartLine {
  productId: string;
  size: string;
  quantity: number;
}

export const toStoredCart = (cart: CartItem[]): StoredCartLine[] =>
  cart.map((item) => ({ productId: item.product.id, size: item.selectedSize, quantity: item.quantity }));

/**
 * Rebuilds cart lines against the live catalogue: pieces that were removed, hidden or
 * sold out in that size are dropped, quantities are capped to current stock, and the
 * current product record (price, stock) is always used.
 */
export function reconcileCart(lines: StoredCartLine[], products: Product[]): CartItem[] {
  const result: CartItem[] = [];
  for (const line of lines) {
    if (!line || typeof line.productId !== "string" || typeof line.size !== "string") continue;
    const product = products.find((p) => p.id === line.productId && p.status === "enabled");
    if (!product) continue;
    const max = stockFor(product, line.size);
    const quantity = Math.min(max, Math.floor(Number(line.quantity) || 0));
    if (quantity <= 0) continue;
    if (result.some((item) => sameLine(item, product.id, line.size))) continue;
    result.push({ product, selectedSize: line.size, quantity });
  }
  return result;
}

// True when two carts hold the same lines, products and quantities
export const sameCart = (a: CartItem[], b: CartItem[]) =>
  a.length === b.length &&
  a.every((item, i) => item.product === b[i].product && item.selectedSize === b[i].selectedSize && item.quantity === b[i].quantity);
