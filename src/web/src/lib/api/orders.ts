import { get, orNull, post } from './http';
import type { Order, VoucherDiscount } from './types';

export interface PlaceOrder {
  addressId: string;
  paymentMethod: 'cod';
  note: string | null;
  voucherCode: string | null;
  tipPaisa: number;
}

/**
 * Turns the cart into an order (order-service). The same `key` on a retry
 * returns the first order instead of placing a second.
 */
export const placeOrder = (token: string, key: string, order: PlaceOrder) =>
  post<Order>('orders', order, { token, headers: { 'Idempotency-Key': key } });

/** The order, or null if it isn't one the caller may see. */
export const getOrder = (token: string, id: string) => orNull(get<Order>(`orders/${id}`, { token }));

/** What the code takes off the caller's cart now; 422 with the reason if nothing. */
export const voucherDiscount = (token: string, code: string) =>
  get<VoucherDiscount>(`orders/vouchers/${encodeURIComponent(code)}/discount`, { token });
