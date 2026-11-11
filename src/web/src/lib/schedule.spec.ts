import { describe, expect, it } from 'vitest';
import { dayName, slotsByDay, slotWindow, whenLabel } from './schedule';

// Wed 11 Nov 2026, 15:00 in Pakistan.
const now = Date.parse('2026-11-11T10:00:00Z');

describe('slotWindow', () => {
  it('starts just past an hour ahead and ends within a week', () => {
    const { from, to } = slotWindow(now);
    expect(from.toISOString()).toBe('2026-11-11T11:05:00.000Z');
    expect(to.toISOString()).toBe('2026-11-18T09:55:00.000Z');
  });
});

describe('dayName', () => {
  it('names today and tomorrow in Pakistan time, then the date', () => {
    expect(dayName('2026-11-11T18:30:00Z', now)).toBe('Today'); // 23:30 in Karachi
    expect(dayName('2026-11-11T19:30:00Z', now)).toBe('Tomorrow'); // 00:30 next day in Karachi
    expect(dayName('2026-11-14T08:00:00Z', now)).toBe('Sat 14 Nov');
  });
});

describe('whenLabel', () => {
  it('gives the day and the clock time', () => {
    expect(whenLabel('2026-11-11T14:30:00Z', now)).toBe('Today, 19:30');
  });
});

describe('slotsByDay', () => {
  it('groups the slots by day, keeping their order', () => {
    expect(slotsByDay(['2026-11-11T14:30:00Z', '2026-11-11T15:00:00Z', '2026-11-12T07:00:00Z'], now)).toEqual([
      {
        day: 'Today',
        slots: [
          { iso: '2026-11-11T14:30:00Z', time: '19:30' },
          { iso: '2026-11-11T15:00:00Z', time: '20:00' },
        ],
      },
      { day: 'Tomorrow', slots: [{ iso: '2026-11-12T07:00:00Z', time: '12:00' }] },
    ]);
  });
});
