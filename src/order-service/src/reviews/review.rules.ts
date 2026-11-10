import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { Status, StatusHistoryRow } from '../db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the order was delivered and by which rider (null when an admin recorded it). */
export interface Delivery {
  at: Date;
  riderId: string | null;
}

/** The delivery as the order's timeline records it, or null if it was never delivered. */
export function deliveryOf(history: Pick<StatusHistoryRow, 'status' | 'actor' | 'actorId' | 'at'>[]): Delivery | null {
  const delivered = history.find((h) => h.status === 'delivered');
  if (!delivered) return null;
  // The rider who picked it up delivered it, even if an admin then marked it delivered.
  const byRider = history.filter((h) => h.actor === 'rider' && h.actorId).at(-1);
  return { at: delivered.at, riderId: byRider?.actorId ?? null };
}

/**
 * Whether `customerId` may review this order now; throws the reason if not.
 * Being able to see the order (404 otherwise) is checked before this.
 */
export function assertReviewable(
  order: { customerId: string; status: Status },
  delivery: Delivery | null,
  review: { reviewerId: string; riderRating: number | null; now: Date; windowDays: number },
): asserts delivery is Delivery {
  if (order.customerId !== review.reviewerId) throw new ForbiddenException('Only the customer can review an order');
  if (order.status !== 'delivered' || !delivery) throw new ConflictException('Only delivered orders can be reviewed');
  if (review.now.getTime() - delivery.at.getTime() > review.windowDays * DAY_MS) {
    throw new ConflictException(`Orders can be reviewed within ${review.windowDays} days of delivery`);
  }
  if (review.riderRating !== null && !delivery.riderId) {
    throw new BadRequestException('No rider delivered this order; leave out riderRating');
  }
}
