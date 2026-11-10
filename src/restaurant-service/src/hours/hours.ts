import { z } from 'zod';
import { DAYS, type Day, type SpecialHours, type TimeRange, type WeeklyHours } from '../db/schema';

// Shapes match TimeRange / WeeklyHours / SpecialHours / Hours in contracts/openapi/restaurant-service.yaml.

/** Every restaurant is in Pakistan; opening hours are local time there. */
export const TIME_ZONE = 'Asia/Karachi';

const MINUTES_PER_DAY = 24 * 60;
const MAX_SPECIAL_DAYS = 60;

export const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The range as minutes after the start of its opening day; `end` > 1440 when it runs past midnight. */
function span({ opens, closes }: TimeRange): { start: number; end: number } {
  const start = toMinutes(opens);
  const end = toMinutes(closes);
  return { start, end: end <= start ? end + MINUTES_PER_DAY : end };
}

const timeRange = z
  .strictObject({
    opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM'),
    closes: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'use HH:MM'),
  })
  .refine((r) => toMinutes(r.opens) !== toMinutes(r.closes), 'opens and closes must differ');

const dayRanges = z
  .array(timeRange)
  .max(3)
  .refine((ranges) => {
    const spans = ranges.map(span).sort((a, b) => a.start - b.start);
    return spans.every((s, i) => i === 0 || s.start >= spans[i - 1].end);
  }, 'ranges overlap');

const isoDate = z.iso.date();
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

const specialHours = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    startsOn: isoDate,
    endsOn: isoDate,
    ranges: dayRanges,
  })
  .refine((s) => s.endsOn >= s.startsOn, { message: 'endsOn is before startsOn', path: ['endsOn'] })
  .refine((s) => dayNumber(s.endsOn) - dayNumber(s.startsOn) < MAX_SPECIAL_DAYS, {
    message: `special hours can cover at most ${MAX_SPECIAL_DAYS} days`,
    path: ['endsOn'],
  });

export const hoursSchema = z.strictObject({
  weekly: z.strictObject(
    Object.fromEntries(DAYS.map((d) => [d, dayRanges.optional()])) as Record<Day, z.ZodOptional<typeof dayRanges>>,
  ),
  special: z
    .array(specialHours)
    .max(20)
    .refine((list) => {
      const sorted = [...list].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
      return sorted.every((s, i) => i === 0 || s.startsOn > sorted[i - 1].endsOn);
    }, 'special hours overlap'),
});
export type HoursDto = z.output<typeof hoursSchema>;

export interface Hours {
  weekly: WeeklyHours;
  special: SpecialHours[];
}

const localFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Local calendar date (YYYY-MM-DD) and minute of the day at `at`. */
export function localTime(at: Date): { date: string; minutes: number } {
  const parts = Object.fromEntries(localFormat.formatToParts(at).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function previousDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** The ranges that apply on a local date: its special hours if any, otherwise the weekday's. */
export function rangesOn(hours: Hours, date: string): TimeRange[] {
  const special = hours.special.find((s) => s.startsOn <= date && date <= s.endsOn);
  if (special) return special.ranges;
  const day = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return hours.weekly[day] ?? [];
}

/** Whether the restaurant's hours include the instant `at`, counting yesterday's ranges that run past midnight. */
export function isOpenAt(hours: Hours, at: Date): boolean {
  const { date, minutes } = localTime(at);
  if (
    rangesOn(hours, date).some((r) => {
      const s = span(r);
      return minutes >= s.start && minutes < s.end;
    })
  ) {
    return true;
  }
  return rangesOn(hours, previousDate(date)).some((r) => minutes < span(r).end - MINUTES_PER_DAY);
}

/** Whether any day of the week has opening hours (a restaurant needs them to be approved). */
export const hasWeeklyHours = (weekly: WeeklyHours): boolean => DAYS.some((d) => (weekly[d]?.length ?? 0) > 0);
