'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readAddress } from '@/lib/address-form';
import { ApiError } from '@/lib/api/http';
import { placeOrder } from '@/lib/api/orders';
import { saveAddress } from '@/lib/api/users';
import { checkoutHref, parseCheckout } from '@/lib/checkout';
import { currentLocation } from '@/lib/current-location';
import { accessToken } from '@/lib/session';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim() || null;

/** Saves the new address at the chosen delivery point and selects it. */
export async function addAddress(form: FormData) {
  const [token, location] = await Promise.all([accessToken(), currentLocation()]);
  if (!token) redirect('/login?next=/checkout');
  if (!location) redirect('/');
  const address = await saveAddress(
    token,
    readAddress((name) => String(form.get(name) ?? ''), location),
  );
  const choices = parseCheckout(Object.fromEntries(new URLSearchParams(String(form.get('choices') ?? ''))));
  redirect(checkoutHref(choices, { addressId: address.id }));
}

export type PlaceOrderState = { errors: string[] };

/**
 * Places the order and opens it. `key` was fixed when the page rendered, so a
 * double click or a retry after a lost answer finds the same order.
 */
export async function submitOrder(_: PlaceOrderState, form: FormData): Promise<PlaceOrderState> {
  const token = await accessToken();
  if (!token) redirect('/login?next=/checkout');
  const addressId = text(form, 'addressId');
  if (!addressId) return { errors: ['Choose where to deliver.'] };
  let orderId: string;
  try {
    const order = await placeOrder(token, String(form.get('key')), {
      addressId,
      paymentMethod: 'cod',
      note: text(form, 'note'),
      voucherCode: text(form, 'voucher'),
      tipPaisa: Number(form.get('tip')) || 0,
      scheduledFor: text(form, 'scheduledFor'),
    });
    orderId = order.id;
  } catch (err) {
    if (err instanceof ApiError && [400, 409, 422].includes(err.status)) return { errors: err.message.split('; ') };
    if (err instanceof ApiError && err.status === 503)
      return { errors: ['We could not reach the restaurant just now. Please try again.'] };
    throw err;
  }
  revalidatePath('/cart');
  redirect(`/orders/${orderId}`);
}
