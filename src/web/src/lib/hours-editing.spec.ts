import type { Hours } from './api/types';
import { draftOf, overlap, readHoursDraft } from './hours-editing';

const hours: Hours = {
  weekly: {
    mon: [{ opens: '11:00', closes: '23:00' }],
    fri: [
      { opens: '11:00', closes: '13:00' },
      { opens: '14:30', closes: '01:00' },
    ],
    sun: [{ opens: '00:00', closes: '24:00' }],
  },
  special: [{ name: 'Eid', startsOn: '2027-03-10', endsOn: '2027-03-10', ranges: [] }],
};

describe('hours editing', () => {
  it('opens saved hours as closed, all day or ranges, and saves them back unchanged', () => {
    const draft = draftOf(hours);
    expect(draft.weekly.tue.mode).toBe('closed');
    expect(draft.weekly.sun.mode).toBe('allDay');
    expect(draft.weekly.fri.ranges).toHaveLength(2);
    expect(draft.special[0].closed).toBe(true);
    expect(readHoursDraft(draft)).toEqual({
      hours: { weekly: { ...hours.weekly, tue: [], wed: [], thu: [], sat: [] }, special: hours.special },
    });
  });

  it('lists what to fix', () => {
    const draft = draftOf(hours);
    draft.weekly.mon.ranges = [{ opens: '11:00', closes: '11:00' }];
    draft.weekly.fri.ranges = [{ opens: '', closes: '13:00' }];
    draft.special = [{ name: '', startsOn: '2027-03-12', endsOn: '2027-03-10', closed: true, ranges: [] }];
    expect(readHoursDraft(draft)).toEqual({
      errors: [
        "Monday: opening and closing can't be the same time.",
        'Friday: choose both times.',
        'Name special day 1, e.g. Eid.',
        'Special day 1: the last day is before the first.',
      ],
    });
  });

  it.each([
    ['11:00', '15:00', '14:00', '23:00', true],
    ['11:00', '15:00', '15:00', '23:00', false],
    ['18:00', '02:00', '01:00', '03:00', true],
    ['18:00', '02:00', '11:00', '15:00', false],
  ])('%s–%s and %s–%s overlap: %s', (o1, c1, o2, c2, expected) =>
    expect(overlap({ opens: o1, closes: c1 }, { opens: o2, closes: c2 })).toBe(expected),
  );

  it('says when two opening times overlap', () => {
    const draft = draftOf(hours);
    draft.weekly.mon.ranges = [
      { opens: '11:00', closes: '23:00' },
      { opens: '18:00', closes: '23:00' },
    ];
    expect(readHoursDraft(draft)).toEqual({
      errors: ['Monday: two opening times overlap; make one end before the next begins.'],
    });
  });
});
