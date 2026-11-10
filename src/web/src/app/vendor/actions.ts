'use server';

import { revalidatePath } from 'next/cache';
import { refusal } from '@/lib/api/http';
import { setOrderStatus } from '@/lib/api/orders';
import { pauseOrders, resumeOrders } from '@/lib/api/restaurants';
import { PREP_TIMES } from '@/lib/kitchen';
import { accessToken, requireUser } from '@/lib/session';

export type TicketState = { error?: string };

const tokenFor = async (restaurantId: string) => {
  await requireUser(`/vendor/${restaurantId}`);
  return (await accessToken())!;
};

/** Accepts a new order with a prep time, rejects it with a reason, or marks the food ready. */
export async function answerOrder(
  restaurantId: string,
  orderId: string,
  _prev: TicketState,
  form: FormData,
): Promise<TicketState> {
  const token = await tokenFor(restaurantId);
  const to = form.get('to');
  let change: Parameters<typeof setOrderStatus>[2];
  if (to === 'accepted') {
    const prep = Number(form.get('prepTimeMinutes'));
    if (!PREP_TIMES.includes(prep as (typeof PREP_TIMES)[number])) return { error: 'Choose how long it will take.' };
    change = { status: 'accepted', prepTimeMinutes: prep };
  } else if (to === 'rejected') {
    const own = String(form.get('ownReason') ?? '').trim();
    const reason = own || String(form.get('reason') ?? '').trim();
    if (!reason) return { error: 'Tell the customer why.' };
    change = { status: 'rejected', reason };
  } else if (to === 'ready') {
    change = { status: 'ready' };
  } else {
    return { error: 'Choose what to do with the order.' };
  }
  try {
    await setOrderStatus(token, orderId, change);
  } catch (err) {
    // e.g. 409 when the 10 minutes ran out and order-service already rejected it.
    const error = refusal(err);
    if (error === null) throw err;
    return { error };
  }
  revalidatePath(`/vendor/${restaurantId}`, 'layout');
  return {};
}

/** Stops new orders for the minutes chosen, or (minutes 0) takes them again. */
export async function setPause(restaurantId: string, form: FormData): Promise<void> {
  const token = await tokenFor(restaurantId);
  const minutes = Number(form.get('minutes'));
  if (minutes > 0) await pauseOrders(token, restaurantId, minutes);
  else await resumeOrders(token, restaurantId);
  revalidatePath(`/vendor/${restaurantId}`, 'layout');
}
