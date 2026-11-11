import type { Notification } from './api/types';

/** How often the bell asks for the unread count while a page is open. */
export const BELL_POLL_MS = 30_000;

/** Kinds that are the rider's: their link is the rider app, not the customer's order page. */
const RIDER_KINDS = new Set(['delivery_assigned']);

/** Where a notification takes you: the rider app for a rider's, the order otherwise; null when nowhere. */
export function notificationHref(n: Pick<Notification, 'kind' | 'data'>): string | null {
  if (RIDER_KINDS.has(n.kind) || n.data.chat === 'rider') return '/rider';
  return n.data.orderId ? `/orders/${n.data.orderId}` : null;
}

/** "9+" past nine, so the badge stays small. */
export const badge = (count: number) => (count > 9 ? '9+' : String(count));
