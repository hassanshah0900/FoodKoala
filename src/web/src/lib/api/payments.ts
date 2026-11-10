import { get, orNull } from './http';
import type { Page, Payment, PaymentStatus } from './types';

/** Payments with a status, newest first (admin); `pending` is the cash still to be collected. */
export const paymentsWithStatus = (token: string, status: PaymentStatus, page = 1) =>
  get<Page<Payment>>('payments', { token, query: { status, page } });

export const paymentOfOrder = (token: string, orderId: string) =>
  orNull(get<Payment>(`payments/orders/${orderId}`, { token }));
