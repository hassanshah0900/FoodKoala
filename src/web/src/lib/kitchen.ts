import type { Order } from './api/types';

// A restaurant's live orders, as its owner works through them.

/**
 * order-service rejects an order nobody accepts within this many minutes
 * (its ACCEPT_TIMEOUT_MINUTES, 10 by default), so new tickets count down to it.
 */
export const ACCEPT_WITHIN_MINUTES = 10;

/** Prep times offered when accepting (order-service takes 5 to 120). */
export const PREP_TIMES = [10, 15, 20, 30, 45, 60] as const;

/** Reasons a customer is most often given; the owner can write their own. */
export const REJECT_REASONS = [
  'The kitchen is too busy right now',
  'An item in the order is out of stock',
  'We are closing soon',
];

/** Pauses offered when the kitchen needs a break from new orders. */
export const PAUSES = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
] as const;

/** Whole minutes left to answer a new order before order-service rejects it; 0 once it is late. */
export const minutesToAnswer = (placedAt: string, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(placedAt) + ACCEPT_WITHIN_MINUTES * 60_000 - now) / 60_000));

export type Column = 'placed' | 'accepted' | 'ready';

/** The board's three columns, each oldest first so the order waiting longest is on top. */
export function board(orders: Order[]): Record<Column, Order[]> {
  const columns: Record<Column, Order[]> = { placed: [], accepted: [], ready: [] };
  for (const o of orders) if (o.status in columns) columns[o.status as Column].push(o);
  for (const list of Object.values(columns)) list.sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
  return columns;
}

/** When the food should be ready: accepted at plus the prep time given; null before it is accepted. */
export function readyBy(order: Order): string | null {
  const accepted = order.timeline.find((t) => t.status === 'accepted');
  if (!accepted || order.prepTimeMinutes === null) return null;
  return new Date(Date.parse(accepted.at) + order.prepTimeMinutes * 60_000).toISOString();
}
