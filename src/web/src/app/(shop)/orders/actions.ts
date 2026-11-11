'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { reorder } from '@/lib/api/cart';
import { ApiError, refusal } from '@/lib/api/http';
import { reviewOrder } from '@/lib/api/orders';
import { accessToken, requireUser } from '@/lib/session';

export type AgainState = {
  error?: string;
  /** The cart holds another restaurant's food: ask before replacing it. */
  otherRestaurant?: boolean;
  skipped?: { name: string; reason: string }[];
};

/** Puts the order back in the cart; straight to the cart unless something couldn't be added. */
export async function orderAgain(orderId: string, _prev: AgainState, form: FormData): Promise<AgainState> {
  await requireUser('/orders');
  const token = (await accessToken())!;
  let skipped: AgainState['skipped'];
  try {
    skipped = (await reorder(token, orderId, form.get('replace') === 'true')).skipped;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && /another restaurant/i.test(err.message))
      return { otherRestaurant: true };
    const error = refusal(err);
    if (error === null) throw err;
    return { error };
  }
  revalidatePath('/cart');
  if (skipped.length === 0) redirect('/cart');
  return { skipped };
}

export type ReviewState = { error?: string };

const rating = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

export async function rateOrder(orderId: string, withRider: boolean, _prev: ReviewState, form: FormData) {
  await requireUser(`/orders/${orderId}`);
  const token = (await accessToken())!;
  const restaurantRating = rating(form.get('restaurantRating'));
  const riderRating = withRider ? rating(form.get('riderRating')) : null;
  if (!restaurantRating || (withRider && !riderRating)) return { error: 'Choose the stars first.' };
  try {
    await reviewOrder(token, orderId, {
      restaurantRating,
      riderRating,
      comment: String(form.get('comment') ?? '').trim() || null,
    });
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { error };
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  return {};
}
