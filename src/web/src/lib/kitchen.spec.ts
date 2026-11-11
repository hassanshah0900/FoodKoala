import type { Order } from './api/types';
import { board, held, isHeld, minutesToAnswer, readyBy } from './kitchen';

const order = (id: string, status: Order['status'], placedAt: string, extra: Partial<Order> = {}) =>
  ({
    id,
    status,
    placedAt,
    releaseAt: placedAt,
    scheduledFor: null,
    timeline: [],
    prepTimeMinutes: null,
    ...extra,
  }) as unknown as Order;

describe('kitchen', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');

  it('counts down the 10 minutes to answer a new order', () => {
    expect(minutesToAnswer('2026-11-11T11:56:30Z', now)).toBe(7);
    expect(minutesToAnswer('2026-11-11T11:45:00Z', now)).toBe(0);
  });

  it('puts orders in their column, the one waiting longest first', () => {
    const b = board([
      order('b', 'placed', '2026-11-11T11:58:00Z'),
      order('a', 'placed', '2026-11-11T11:50:00Z'),
      order('c', 'accepted', '2026-11-11T11:40:00Z'),
      order('d', 'delivered', '2026-11-11T11:00:00Z'),
    ]);
    expect(b.placed.map((o) => o.id)).toEqual(['a', 'b']);
    expect(b.accepted.map((o) => o.id)).toEqual(['c']);
    expect(b.ready).toEqual([]);
  });

  it('holds scheduled orders until their release, the soonest due first', () => {
    const later = order('l', 'placed', '2026-11-11T10:00:00Z', {
      scheduledFor: '2026-11-11T15:00:00Z',
      releaseAt: '2026-11-11T14:15:00Z',
    });
    const sooner = order('s', 'placed', '2026-11-11T11:00:00Z', {
      scheduledFor: '2026-11-11T13:00:00Z',
      releaseAt: '2026-11-11T12:15:00Z',
    });
    const released = order('r', 'placed', '2026-11-11T09:00:00Z', {
      scheduledFor: '2026-11-11T12:30:00Z',
      releaseAt: '2026-11-11T11:45:00Z',
    });
    expect(isHeld(released, now)).toBe(false);
    expect(isHeld(order('n', 'placed', '2026-11-11T11:59:00Z'), now)).toBe(false);
    expect(held([later, released, sooner], now).map((o) => o.id)).toEqual(['s', 'l']);
  });

  it('works out when the food should be ready', () => {
    const accepted = order('a', 'accepted', '2026-11-11T11:50:00Z', {
      prepTimeMinutes: 20,
      timeline: [{ status: 'accepted', at: '2026-11-11T11:52:00Z', by: 'restaurant', reason: null }],
    });
    expect(readyBy(accepted)).toBe('2026-11-11T12:12:00.000Z');
    expect(readyBy(order('b', 'placed', '2026-11-11T11:50:00Z'))).toBeNull();
  });
});
