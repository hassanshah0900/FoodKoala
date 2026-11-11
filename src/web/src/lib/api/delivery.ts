import { get, orNull, post, put } from './http';
import type {
  DeliveryStatus,
  Earnings,
  OrderDelivery,
  Page,
  Point,
  Rider,
  RiderStatus,
  Settlement,
  SettlementKind,
} from './types';

// delivery-service. Admins review riders, settle cash and watch deliveries; riders work their shifts.

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
  get<Page<OrderDelivery>>('delivery/deliveries', { token, query: { status, page } });

/** An order's delivery, or null when it never had one (e.g. rejected before it was created). */
export const deliveryOfOrder = (token: string, orderId: string) =>
  orNull(get<OrderDelivery>(`delivery/deliveries/orders/${orderId}`, { token }));

// The rider, as themselves.

/** The caller's rider account, or null when they haven't applied. */
export const myRider = (token: string) => orNull(get<Rider>('delivery/riders/me', { token }));

export const applyToRide = (token: string, a: { name: string; vehicle: Rider['vehicle']; city: string }) =>
  post<Rider>('delivery/riders', a, { token });

/** Starts a shift where the rider is. */
export const goOnline = (token: string, location: Point) =>
  post<Rider>('delivery/riders/me/online', { location }, { token });

export const goOffline = (token: string) => post<Rider>('delivery/riders/me/offline', undefined, { token });

/** Where the rider is now; while carrying an order the customer sees it. */
export const sendLocation = (token: string, at: Point) => put<void>('delivery/riders/me/location', at, { token });

/** The delivery the rider is collecting or carrying, or null. */
export const myDelivery = (token: string) => orNull(get<OrderDelivery>('delivery/riders/me/delivery', { token }));

/** I have the food, I've handed it over, or I hand an assigned delivery back. */
export const deliveryStep = (token: string, id: string, step: 'pickup' | 'dropoff' | 'decline') =>
  post<OrderDelivery | undefined>(`delivery/deliveries/${id}/${step}`, undefined, { token });
