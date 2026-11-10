'use server';

import { revalidatePath } from 'next/cache';
import { addLine, type NewLine, removeLine, setQuantity } from '@/lib/api/cart';
import { ApiError } from '@/lib/api/http';
import { accessToken } from '@/lib/session';

/** What adding an item came to, for the item sheet to act on. */
export type AddResult = { ok: true } | { signIn: string } | { otherRestaurant: true } | { error: string };

/** Pages that show the cart: the restaurant's and /cart. Both re-render after a change. */
function refresh(restaurantId: string | null) {
  if (restaurantId) revalidatePath(`/restaurant/${restaurantId}`);
  revalidatePath('/cart');
}

export async function addToCart(line: NewLine): Promise<AddResult> {
  const token = await accessToken();
  if (!token) return { signIn: `/login?next=${encodeURIComponent(`/restaurant/${line.restaurantId}`)}` };
  try {
    await addLine(token, line);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && !line.replace && /another restaurant/i.test(err.message))
      return { otherRestaurant: true };
    if (err instanceof ApiError && [400, 409, 422].includes(err.status)) return { error: err.message };
    throw err;
  }
  refresh(line.restaurantId);
  return { ok: true };
}

/** One more or one fewer of a line; down to 0 removes it. Called from plain forms, so it works without JavaScript. */
export async function changeQuantity(restaurantId: string, lineId: string, quantity: number) {
  const token = await accessToken();
  if (!token) return;
  if (quantity < 1) await removeLine(token, lineId);
  else await setQuantity(token, lineId, Math.min(quantity, 50));
  refresh(restaurantId);
}
