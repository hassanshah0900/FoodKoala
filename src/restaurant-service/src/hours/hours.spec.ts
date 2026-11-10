import { type Hours, hasWeeklyHours, hoursSchema, isOpenAt, localTime } from './hours';

/** An instant given in Pakistan local time. 2026-11-09 is a Monday. */
const pk = (local: string) => new Date(`${local}:00+05:00`);

describe('localTime', () => {
  it('converts to Asia/Karachi (UTC+5)', () => {
    expect(localTime(new Date('2026-11-09T20:30:00Z'))).toEqual({ date: '2026-11-10', minutes: 90 });
  });
});

describe('isOpenAt', () => {
  const hours: Hours = {
    weekly: {
      mon: [
        { opens: '11:00', closes: '15:00' },
        { opens: '18:00', closes: '02:00' },
      ],
      tue: [{ opens: '11:00', closes: '23:00' }],
      sun: [{ opens: '00:00', closes: '24:00' }],
    },
    special: [],
  };

  it.each([
    ['2026-11-09T10:59', false, 'before opening'],
    ['2026-11-09T11:00', true, 'at opening'],
    ['2026-11-09T14:59', true, 'just before the break'],
    ['2026-11-09T15:00', false, 'at closing (exclusive)'],
    ['2026-11-09T23:30', true, 'in the evening range'],
    ['2026-11-10T01:59', true, "after midnight, on Monday's overnight range"],
    ['2026-11-10T02:00', false, 'when the overnight range closes'],
    ['2026-11-11T00:30', false, 'Tuesday closes at 23:00, nothing spills over'],
    ['2026-11-12T12:00', false, 'on a day with no hours'],
    ['2026-11-15T23:59', true, 'open all day on Sunday'],
    ['2026-11-16T00:00', false, 'Sunday 24:00 does not spill into Monday'],
  ])('at %s is %s (%s)', (at, open) => {
    expect(isOpenAt(hours, pk(at))).toBe(open);
  });

  describe('with special hours', () => {
    const ramadan: Hours = {
      weekly: { mon: [{ opens: '11:00', closes: '23:00' }], tue: [{ opens: '11:00', closes: '23:00' }] },
      special: [
        {
          name: 'Ramadan',
          startsOn: '2026-11-09',
          endsOn: '2026-11-09',
          ranges: [{ opens: '17:30', closes: '04:30' }],
        },
        { name: 'Eid', startsOn: '2026-11-10', endsOn: '2026-11-10', ranges: [] },
      ],
    };

    it('replaces the weekly hours on the days they cover', () => {
      expect(isOpenAt(ramadan, pk('2026-11-09T12:00'))).toBe(false);
      expect(isOpenAt(ramadan, pk('2026-11-09T18:00'))).toBe(true);
    });

    it("keeps the previous day's overnight range even when today is closed", () => {
      expect(isOpenAt(ramadan, pk('2026-11-10T04:00'))).toBe(true);
      expect(isOpenAt(ramadan, pk('2026-11-10T12:00'))).toBe(false);
    });
  });
});

describe('hoursSchema', () => {
  const ok = (body: unknown) => hoursSchema.safeParse(body).success;

  it('accepts weekly and special hours', () => {
    expect(
      ok({
        weekly: {
          fri: [
            { opens: '11:00', closes: '13:00' },
            { opens: '14:30', closes: '01:00' },
          ],
        },
        special: [
          {
            name: 'Ramadan',
            startsOn: '2027-02-08',
            endsOn: '2027-03-09',
            ranges: [{ opens: '17:30', closes: '04:30' }],
          },
        ],
      }),
    ).toBe(true);
  });

  it.each([
    ['a bad time', { weekly: { mon: [{ opens: '9:00', closes: '17:00' }] }, special: [] }],
    ['opens equal to closes', { weekly: { mon: [{ opens: '09:00', closes: '09:00' }] }, special: [] }],
    ['24:00 as an opening time', { weekly: { mon: [{ opens: '24:00', closes: '02:00' }] }, special: [] }],
    [
      'overlapping ranges',
      {
        weekly: {
          mon: [
            { opens: '11:00', closes: '15:00' },
            { opens: '14:00', closes: '18:00' },
          ],
        },
        special: [],
      },
    ],
    [
      'an overnight range overlapping a later one',
      {
        weekly: {
          mon: [
            { opens: '20:00', closes: '02:00' },
            { opens: '22:00', closes: '23:00' },
          ],
        },
        special: [],
      },
    ],
    ['an unknown day', { weekly: { monday: [] }, special: [] }],
    [
      'special hours ending before they start',
      { weekly: {}, special: [{ name: 'x', startsOn: '2027-01-02', endsOn: '2027-01-01', ranges: [] }] },
    ],
    [
      'special hours longer than 60 days',
      { weekly: {}, special: [{ name: 'x', startsOn: '2027-01-01', endsOn: '2027-03-02', ranges: [] }] },
    ],
    [
      'overlapping special hours',
      {
        weekly: {},
        special: [
          { name: 'a', startsOn: '2027-01-01', endsOn: '2027-01-05', ranges: [] },
          { name: 'b', startsOn: '2027-01-05', endsOn: '2027-01-06', ranges: [] },
        ],
      },
    ],
    [
      'an invalid date',
      { weekly: {}, special: [{ name: 'x', startsOn: '2027-02-30', endsOn: '2027-03-01', ranges: [] }] },
    ],
  ])('rejects %s', (_, body) => {
    expect(ok(body)).toBe(false);
  });
});

describe('hasWeeklyHours', () => {
  it('is false when every day is closed', () => {
    expect(hasWeeklyHours({})).toBe(false);
    expect(hasWeeklyHours({ mon: [] })).toBe(false);
    expect(hasWeeklyHours({ mon: [{ opens: '11:00', closes: '23:00' }] })).toBe(true);
  });
});
