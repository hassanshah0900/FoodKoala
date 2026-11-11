import type { RestaurantRow } from '../db/schema';
import { openSlots } from './restaurants.view';

type Row = Pick<RestaurantRow, 'status' | 'weeklyHours' | 'specialHours' | 'pausedUntil'>;

// Lunch only on Mondays, Pakistan time (UTC+5): 12:00–15:00 local is 07:00–10:00 UTC.
const lunch: Row = {
  status: 'approved',
  weeklyHours: { mon: [{ opens: '12:00', closes: '15:00' }] },
  specialHours: [],
  pausedUntil: null,
};
const iso = (d: Date[]) => d.map((x) => x.toISOString());

describe('openSlots', () => {
  // Monday 2026-11-09.
  const from = new Date('2026-11-09T06:50:00Z');
  const to = new Date('2026-11-09T10:30:00Z');

  it('steps on the clock inside the opening hours', () => {
    expect(iso(openSlots(lunch, from, to, 60))).toEqual([
      '2026-11-09T07:00:00.000Z',
      '2026-11-09T08:00:00.000Z',
      '2026-11-09T09:00:00.000Z',
    ]);
  });

  it('skips the time a restaurant is paused', () => {
    const paused = { ...lunch, pausedUntil: new Date('2026-11-09T08:10:00Z') };
    expect(iso(openSlots(paused, from, to, 60))).toEqual(['2026-11-09T09:00:00.000Z']);
  });

  it('has none for a restaurant that is not approved, or on a closed day', () => {
    expect(openSlots({ ...lunch, status: 'pending' }, from, to, 15)).toEqual([]);
    expect(openSlots(lunch, new Date('2026-11-10T06:00:00Z'), new Date('2026-11-10T11:00:00Z'), 15)).toEqual([]);
  });
});
