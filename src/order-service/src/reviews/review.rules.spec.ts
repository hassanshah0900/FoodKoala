import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { assertReviewable, deliveryOf } from './review.rules';

const at = (iso: string) => new Date(iso);
const rider = 'b3c1c6c4-5d7e-4f3a-9a51-0d7e8f9a1b2c';
const admin = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('deliveryOf', () => {
  it('is null until delivered', () => {
    expect(
      deliveryOf([{ status: 'placed', actor: 'customer', actorId: 'c', at: at('2026-11-10T10:00:00Z') }]),
    ).toBeNull();
  });

  it('takes the time of delivery and the rider who carried it', () => {
    expect(
      deliveryOf([
        { status: 'placed', actor: 'customer', actorId: 'c', at: at('2026-11-10T10:00:00Z') },
        { status: 'picked_up', actor: 'rider', actorId: rider, at: at('2026-11-10T10:30:00Z') },
        { status: 'delivered', actor: 'admin', actorId: admin, at: at('2026-11-10T10:50:00Z') },
      ]),
    ).toEqual({ at: at('2026-11-10T10:50:00Z'), riderId: rider });
  });

  it('has no rider when an admin recorded pickup and delivery', () => {
    expect(
      deliveryOf([
        { status: 'picked_up', actor: 'admin', actorId: admin, at: at('2026-11-10T10:30:00Z') },
        { status: 'delivered', actor: 'admin', actorId: admin, at: at('2026-11-10T10:50:00Z') },
      ]),
    ).toEqual({ at: at('2026-11-10T10:50:00Z'), riderId: null });
  });
});

describe('assertReviewable', () => {
  const order = { customerId: 'c', status: 'delivered' as const };
  const delivery = { at: at('2026-11-10T10:00:00Z'), riderId: rider };
  const review = { reviewerId: 'c', riderRating: 5, now: at('2026-11-11T10:00:00Z'), windowDays: 7 };

  it('accepts the customer within the window', () => {
    expect(() => assertReviewable(order, delivery, review)).not.toThrow();
    expect(() => assertReviewable(order, delivery, { ...review, now: at('2026-11-17T10:00:00Z') })).not.toThrow();
  });

  it('refuses anyone but the customer', () => {
    expect(() => assertReviewable(order, delivery, { ...review, reviewerId: 'x' })).toThrow(ForbiddenException);
  });

  it('refuses orders not delivered, and after the window', () => {
    expect(() => assertReviewable({ ...order, status: 'cancelled' }, null, review)).toThrow(ConflictException);
    expect(() => assertReviewable(order, delivery, { ...review, now: at('2026-11-17T10:00:01Z') })).toThrow(
      'within 7 days',
    );
  });

  it('refuses a rider rating without a rider', () => {
    expect(() => assertReviewable(order, { ...delivery, riderId: null }, review)).toThrow(BadRequestException);
    expect(() =>
      assertReviewable(order, { ...delivery, riderId: null }, { ...review, riderRating: null }),
    ).not.toThrow();
  });
});
