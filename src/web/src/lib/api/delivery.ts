import { get, orNull, post } from './http';
import type { Delivery, DeliveryStatus, Earnings, Page, Rider, RiderStatus, Settlement, SettlementKind } from './types';

// delivery-service, as an admin: reviewing riders, settling cash with them, and watching deliveries.

/** Riders with a status, oldest application first. */
export const ridersWithStatus = (token: string, status: RiderStatus, page = 1) =>
  get<Page<Rider>>('delivery/riders', { token, query: { status, page } });

export const getRider = (token: string, userId: string) => orNull(get<Rider>(`delivery/riders/${userId}`, { token }));

export const setRiderStatus = (token: string, userId: string, status: RiderStatus) =>
  post<Rider>(`delivery/riders/${userId}/status`, { status }, { token });

/** The last 7 days' earnings and the balance so far. */
export const riderEarnings = (token: string, userId: string) =>
  get<Earnings>(`delivery/riders/${userId}/earnings`, { token });

export const riderSettlements = (token: string, userId: string, page = 1) =>
  get<Page<Settlement>>(`delivery/riders/${userId}/settlements`, { token, query: { page } });

export const settleWithRider = (
  token: string,
  userId: string,
  body: { kind: SettlementKind; amountPaisa: number; note: string | null },
) => post<Settlement>(`delivery/riders/${userId}/settlements`, body, { token });

/** Deliveries with a status, newest first; `searching` ones have no rider yet. */
export const deliveriesWithStatus = (token: string, status: DeliveryStatus, page = 1) =>
  get<Page<Delivery>>('delivery/deliveries', { token, query: { status, page } });

/** An order's delivery, or null when it never had one (e.g. rejected before it was created). */
export const deliveryOfOrder = (token: string, orderId: string) =>
  orNull(get<Delivery>(`delivery/deliveries/orders/${orderId}`, { token }));
