import { get, orNull, post } from './http';
import type { Earnings, Page, Rider, RiderStatus, Settlement, SettlementKind } from './types';

// delivery-service, as an admin: reviewing riders and settling cash with them.

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
