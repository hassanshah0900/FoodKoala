import 'server-only';
import { get, orNull, socket } from './http';
import type { Tracking } from './types';

const LIVE_PROTOCOL = 'foodkoala.tracking.v1';

/** Where the order is now; null when tracking hasn't heard of it (or the user can't see it). */
export const getTracking = (token: string, orderId: string) =>
  orNull(get<Tracking>(`tracking/orders/${orderId}`, { token }));

/** A socket that sends the order's whole Tracking at once and on every change, and closes after the last. */
export const watchTracking = (token: string, orderId: string) =>
  socket(`tracking/orders/${orderId}/live`, LIVE_PROTOCOL, token);
