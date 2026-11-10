import 'server-only';
import { getCart } from './api/cart';
import type { Cart } from './api/types';
import { accessToken } from './session';

/** The signed-in user's cart, or null for a guest. */
export async function currentCart(): Promise<Cart | null> {
  const token = await accessToken();
  return token ? getCart(token) : null;
}
