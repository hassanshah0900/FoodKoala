import { get, request } from './http';
import type { Cart } from './types';

export interface NewLine {
  restaurantId: string;
  itemId: string;
  quantity: number;
  optionIds: string[];
  note: string | null;
  /** Empty a cart holding another restaurant's items first. */
  replace: boolean;
}

/** The signed-in user's cart, priced now (cart-service). */
export const getCart = (token: string) => get<Cart>('cart', { token });

export const addLine = (token: string, line: NewLine) => request<Cart>('POST', 'cart/items', { token, body: line });

export const setQuantity = (token: string, lineId: string, quantity: number) =>
  request<Cart>('PATCH', `cart/items/${lineId}`, { token, body: { quantity } });

export const removeLine = (token: string, lineId: string) => request<Cart>('DELETE', `cart/items/${lineId}`, { token });

/** Puts a past order's lines back in the cart at today's prices; lines the menu can't serve any more are skipped. */
export const reorder = (token: string, orderId: string, replace: boolean) =>
  request<{ cart: Cart; skipped: { itemId: string; name: string; reason: string }[] }>('POST', 'cart/reorder', {
    token,
    body: { orderId, replace },
  });
