import type { Hours, TimeRange, Weekday } from './api/types';
import { DAYS } from './hours';

// The hours form: each day closed, open all day, or open in up to 3 ranges.

export type DayMode = 'closed' | 'allDay' | 'ranges';

export interface DayDraft {
  mode: DayMode;
  /** Kept while the day is switched to closed or all day, so switching back doesn't lose them. */
  ranges: TimeRange[];
}

export interface SpecialDraft {
  name: string;
  startsOn: string;
  endsOn: string;
  closed: boolean;
  ranges: TimeRange[];
}

export interface HoursDraft {
  weekly: Record<Weekday, DayDraft>;
  special: SpecialDraft[];
}

export const MAX_RANGES = 3;
const ALL_DAY: TimeRange = { opens: '00:00', closes: '24:00' };
export const DEFAULT_RANGE: TimeRange = { opens: '11:00', closes: '23:00' };

const isAllDay = (r: TimeRange[]) => r.length === 1 && r[0].opens === '00:00' && r[0].closes === '24:00';

const dayDraft = (ranges: TimeRange[] = []): DayDraft =>
  ranges.length === 0
    ? { mode: 'closed', ranges: [DEFAULT_RANGE] }
    : isAllDay(ranges)
      ? { mode: 'allDay', ranges: [DEFAULT_RANGE] }
      : { mode: 'ranges', ranges };

/** The saved hours as the form edits them. */
export const draftOf = (hours: Hours): HoursDraft => ({
  weekly: Object.fromEntries(DAYS.map(([d]) => [d, dayDraft(hours.weekly[d])])) as Record<Weekday, DayDraft>,
  special: hours.special.map((s) => ({
    name: s.name,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    closed: s.ranges.length === 0,
    ranges: s.ranges.length ? s.ranges : [DEFAULT_RANGE],
  })),
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Minutes from the day's start; a range closing at or before it opens ends the next day. */
const span = (r: TimeRange): [number, number] => {
  const [o, c] = [minutes(r.opens), minutes(r.closes)];
  return [o, c <= o ? c + 1440 : c];
};

/** Whether two ranges share any time, counting one that runs past midnight into the other. */
export function overlap(a: TimeRange, b: TimeRange): boolean {
  const [a1, a2] = span(a);
  const [b1, b2] = span(b);
  return [-1440, 0, 1440].some((shift) => a1 < b2 + shift && b1 + shift < a2);
}

function checkRanges(label: string, ranges: TimeRange[], errors: string[]) {
  if (ranges.length > MAX_RANGES) errors.push(`${label}: at most ${MAX_RANGES} opening times a day.`);
  const valid = ranges.filter((r) => TIME.test(r.opens) && TIME.test(r.closes));
  if (valid.length < ranges.length) errors.push(`${label}: choose both times.`);
  if (valid.some((r) => r.opens === r.closes)) errors.push(`${label}: opening and closing can't be the same time.`);
  else if (valid.some((a, i) => valid.slice(i + 1).some((b) => overlap(a, b))))
    errors.push(`${label}: two opening times overlap; make one end before the next begins.`);
}

/**
 * The form as restaurant-service's Hours, or what to fix. A closing time earlier
 * than the opening one means after midnight. The service checks overlaps.
 */
export function readHoursDraft(d: HoursDraft): { hours: Hours } | { errors: string[] } {
  const errors: string[] = [];
  const weekly: Hours['weekly'] = {};
  for (const [key, day] of DAYS) {
    const draft = d.weekly[key];
    if (draft.mode === 'closed') weekly[key] = [];
    else if (draft.mode === 'allDay') weekly[key] = [ALL_DAY];
    else {
      checkRanges(day, draft.ranges, errors);
      weekly[key] = draft.ranges;
    }
  }
  const special = d.special.map((s, i) => {
    const label = s.name.trim() || `Special day ${i + 1}`;
    if (!s.name.trim()) errors.push(`Name special day ${i + 1}, e.g. Eid.`);
    if (!DATE.test(s.startsOn) || !DATE.test(s.endsOn)) errors.push(`${label}: choose the first and last day.`);
    else if (s.endsOn < s.startsOn) errors.push(`${label}: the last day is before the first.`);
    if (!s.closed) checkRanges(label, s.ranges, errors);
    return { name: s.name.trim(), startsOn: s.startsOn, endsOn: s.endsOn, ranges: s.closed ? [] : s.ranges };
  });
  return errors.length ? { errors } : { hours: { weekly, special } };
}
