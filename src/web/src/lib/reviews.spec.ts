import type { Order } from './api/types';
import { canReview, riderDelivered } from './reviews';

const delivered = (by: string, at: string) =>
  ({
    status: 'delivered',
    timeline: [
      { status: 'placed', at: '2026-11-01T10:00:00Z', by: 'customer', reason: null },
      { status: 'delivered', at, by, reason: null },
    ],
  }) as Pick<Order, 'status' | 'timeline'>;

describe('reviews', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');

  it('rates the rider only when a rider delivered it', () => {
    expect(riderDelivered(delivered('rider', '2026-11-10T10:00:00Z'))).toBe(true);
    expect(riderDelivered(delivered('admin', '2026-11-10T10:00:00Z'))).toBe(false);
  });

  it('takes reviews for 7 days after delivery', () => {
    expect(canReview(delivered('rider', '2026-11-05T12:00:00Z'), now)).toBe(true);
    expect(canReview(delivered('rider', '2026-11-04T11:59:00Z'), now)).toBe(false);
    expect(canReview({ ...delivered('rider', '2026-11-10T10:00:00Z'), status: 'cancelled' }, now)).toBe(false);
  });
});
