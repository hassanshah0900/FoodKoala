import type { Order } from './api/types';
import { board, minutesToAnswer, readyBy } from './kitchen';

const order = (id: string, status: Order['status'], placedAt: string, extra: Partial<Order> = {}) =>
  ({ id, status, placedAt, timeline: [], prepTimeMinutes: null, ...extra }) as unknown as Order;

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

  it('works out when the food should be ready', () => {
    const accepted = order('a', 'accepted', '2026-11-11T11:50:00Z', {
      prepTimeMinutes: 20,
      timeline: [{ status: 'accepted', at: '2026-11-11T11:52:00Z', by: 'restaurant', reason: null }],
    });
    expect(readyBy(accepted)).toBe('2026-11-11T12:12:00.000Z');
    expect(readyBy(order('b', 'placed', '2026-11-11T11:50:00Z'))).toBeNull();
  });
});
