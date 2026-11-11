import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { assertReleased, checkSchedule, KITCHEN_LEAD_MINUTES, pakistanTime, releaseAt } from './schedule';

const now = new Date('2026-11-11T10:00:00Z');
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

describe('checkSchedule', () => {
  it('lets as soon as possible through', () => {
    expect(() => checkSchedule(null, now)).not.toThrow();
  });

  it('takes an hour to a week ahead', () => {
    expect(() => checkSchedule(later(60), now)).not.toThrow();
    expect(() => checkSchedule(later(7 * 24 * 60), now)).not.toThrow();
  });

  it('refuses too soon, in the past or too far ahead', () => {
    expect(() => checkSchedule(later(59), now)).toThrow(UnprocessableEntityException);
    expect(() => checkSchedule(later(-5), now)).toThrow(UnprocessableEntityException);
    expect(() => checkSchedule(later(7 * 24 * 60 + 1), now)).toThrow(UnprocessableEntityException);
  });
});

describe('releaseAt', () => {
  it('is the kitchen lead before a scheduled time', () => {
    expect(releaseAt(later(180), now)).toEqual(later(180 - KITCHEN_LEAD_MINUTES));
  });

  it('is the moment it was placed otherwise', () => {
    expect(releaseAt(null, now)).toBe(now);
  });
});

describe('assertReleased', () => {
  const scheduledFor = later(180);
  const order = { scheduledFor, releaseAt: releaseAt(scheduledFor, now) };

  it('refuses before the release, saying when it can be accepted', () => {
    expect(() => assertReleased(order, now)).toThrow(ConflictException);
    expect(() => assertReleased(order, now)).toThrow(
      'scheduled for Wed 11 Nov, 18:00; accept it from Wed 11 Nov, 17:15',
    );
  });

  it('allows it from the release on, and always for orders as soon as possible', () => {
    expect(() => assertReleased(order, order.releaseAt)).not.toThrow();
    expect(() => assertReleased({ scheduledFor: null, releaseAt: now }, now)).not.toThrow();
  });
});

describe('pakistanTime', () => {
  it('reads UTC as the clock in Pakistan', () => {
    expect(pakistanTime(new Date('2026-11-11T14:30:00Z'))).toBe('Wed 11 Nov, 19:30');
  });
});
