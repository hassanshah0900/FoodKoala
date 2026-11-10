import type { Hours, TimeRange, Weekday } from './api/types';

export const DAYS: [Weekday, string][] = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

const range = (r: TimeRange) =>
  r.opens === '00:00' && r.closes === '24:00' ? 'Open all day' : `${r.opens}–${r.closes}`;

/** Each day of the week with its hours, Monday first: "11:00–15:00, 18:00–02:00" or "Closed". */
export const weekRows = (weekly: Hours['weekly']) =>
  DAYS.map(([key, day]) => {
    const ranges = weekly[key] ?? [];
    return { day, hours: ranges.length ? ranges.map(range).join(', ') : 'Closed' };
  });
