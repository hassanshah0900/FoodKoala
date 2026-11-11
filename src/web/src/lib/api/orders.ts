import { get, orNull, patch, post } from './http';
import type {
  Order,
  OrderReview,
  OrderStatus,
  Page,
  SalesReport,
  Voucher,
  VoucherCreate,
  VoucherDiscount,
  VoucherUpdate,
} from './types';

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

/** The caller's orders, newest first. */
export const myOrders = (token: string, page = 1) => get<Page<Order>>('orders', { token, query: { page, limit: 10 } });

/** The order's review, or null until it is rated. */
export const orderReview = (token: string, id: string) => orNull(get<OrderReview>(`orders/${id}/review`, { token }));

/** Rates a delivered order, once; the rider only when a rider delivered it. */
export const reviewOrder = (
  token: string,
  id: string,
  review: { restaurantRating: number; riderRating: number | null; comment: string | null },
) => post<OrderReview>(`orders/${id}/review`, review, { token });

/**
 * Moves an order on (or stops it); order-service decides who may make which change.
 * Accepting needs a prep time, rejecting a reason, and an admin cancelling a reason.
 */
export const setOrderStatus = (
  token: string,
  id: string,
  change: { status: OrderStatus; reason?: string; prepTimeMinutes?: number },
) => post<Order>(`orders/${id}/status`, change, { token });

/** A restaurant's orders in these statuses, newest first (its owner or an admin). */
export const restaurantOrders = (token: string, restaurantId: string, statuses: OrderStatus[], page = 1, limit = 50) =>
  get<Page<Order>>(`orders/restaurants/${restaurantId}/orders`, {
    token,
    query: { status: statuses.join(','), page, limit },
  });

/** A restaurant's sales for orders placed in [from, to), at most 92 days (its owner or an admin). */
export const salesReport = (token: string, restaurantId: string, from: string, to: string) =>
  get<SalesReport>(`orders/restaurants/${restaurantId}/report`, { token, query: { from, to } });

// Admin: the vouchers customers apply at checkout.

/** Every voucher, newest first. */
export const listVouchers = (token: string, page = 1) =>
  get<Page<Voucher>>('orders/vouchers', { token, query: { page } });

export const createVoucher = (token: string, voucher: VoucherCreate) =>
  post<Voucher>('orders/vouchers', voucher, { token });

/** Pause or resume it, or change its description, limit or end. */
export const updateVoucher = (token: string, id: string, change: VoucherUpdate) =>
  patch<Voucher>(`orders/vouchers/${id}`, change, { token });
