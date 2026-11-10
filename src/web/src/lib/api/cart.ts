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
