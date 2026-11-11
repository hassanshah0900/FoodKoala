import type { SalesReport } from './api/types';

// A restaurant's sales report: the period chosen, the days in it, and how it compares with the one before.

export const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

export type PeriodDays = (typeof PERIODS)[number]['days'];

const DAY = 86_400_000;
const PKT = 5 * 3600_000;

/** The date in Pakistan (UTC+5, no daylight saving) of an instant: "2026-11-11". */
export const pktDate = (ms: number) => new Date(ms + PKT).toISOString().slice(0, 10);

/**
 * Today and the days before it, `days` in all, from midnight in Pakistan to now;
 * and the stretch of the same length just before, to compare with.
 */
export function periodOf(days: number, now = Date.now()) {
  const from = Date.parse(`${pktDate(now)}T00:00:00+05:00`) - (days - 1) * DAY;
  const length = now - from;
  const iso = (ms: number) => new Date(ms).toISOString();
  return { from: iso(from), to: iso(now), previous: { from: iso(from - length), to: iso(from) } };
}

/** Every day of the period, oldest first, with zeros for days without orders (the report leaves those out). */
export function everyDay(report: Pick<SalesReport, 'from' | 'to' | 'days'>): SalesReport['days'] {
  const known = new Map(report.days.map((d) => [d.date, d]));
  const out: SalesReport['days'] = [];
  for (let ms = Date.parse(report.from); ms < Date.parse(report.to); ms += DAY) {
    const date = pktDate(ms);
    out.push(known.get(date) ?? { date, placed: 0, delivered: 0, salesPaisa: 0 });
  }
  return out;
}

/** The change from `before` as a whole percent, or null when there was nothing before to compare with. */
export const change = (now: number, before: number) =>
  before === 0 ? null : Math.round(((now - before) / before) * 100);

/** Up to about 4 round steps from 0 that reach `max`: 0, 2,000, 4,000, 6,000. */
export function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Rupees for an axis: in full under 10,000, then compact: "Rs 900", "Rs 12K", "Rs 1.5M". */
export function axisRupees(paisa: number): string {
  const rs = paisa / 100;
  if (rs < 10_000) return `Rs ${rs.toLocaleString('en-PK')}`;
  if (rs < 1_000_000) return `Rs ${Number((rs / 1000).toFixed(1))}K`;
  return `Rs ${Number((rs / 1_000_000).toFixed(1))}M`;
}
