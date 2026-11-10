import type { Order } from './api/types';

/** order-service takes reviews within this many days of delivery (its REVIEW_WINDOW_DAYS, 7 by default). */
export const REVIEW_WINDOW_DAYS = 7;

const deliveredAt = (o: Pick<Order, 'timeline'>) => o.timeline.find((t) => t.status === 'delivered');

/** A rider took it to the door (not an admin marking it delivered), so the rider can be rated too. */
export const riderDelivered = (o: Pick<Order, 'timeline'>) => deliveredAt(o)?.by === 'rider';

/** Whether the customer can still rate it: delivered, within the window. */
export function canReview(o: Pick<Order, 'status' | 'timeline'>, now = Date.now()): boolean {
  const at = deliveredAt(o)?.at;
  return o.status === 'delivered' && !!at && now - Date.parse(at) <= REVIEW_WINDOW_DAYS * 86_400_000;
}

export const RATING_WORDS = ['', 'Bad', 'Not great', 'OK', 'Good', 'Excellent'];
