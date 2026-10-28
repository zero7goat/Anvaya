import { createContext, useContext } from "react";
import { Product } from "../types";

/**
 * Lets any product card add to the cart without the handler being passed through
 * every page. App provides it; without a provider, cards simply hide quick add.
 */
export interface CartActions {
  addToCart: (product: Product, size: string, quantity: number) => void;
}

export const CartActionsContext = createContext<CartActions | null>(null);

export const useCartActions = () => useContext(CartActionsContext);
