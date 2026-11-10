import { z } from 'zod';

const DAY_MS = 24 * 3600_000;
/** About a quarter: enough for monthly comparisons, small enough to answer quickly. */
export const MAX_REPORT_DAYS = 92;

const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

/** `from` (inclusive) and `to` (exclusive); the last 7 days by default. */
export const reportQuerySchema = z
  .object({ from: instant.optional(), to: instant.optional() })
  .transform(({ from, to }) => {
    const end = to ?? new Date();
    return { from: from ?? new Date(end.getTime() - 7 * DAY_MS), to: end };
  })
  .refine((p) => p.to > p.from, { path: ['to'], message: 'Must be after from' })
  .refine((p) => p.to.getTime() - p.from.getTime() <= MAX_REPORT_DAYS * DAY_MS, {
    path: ['from'],
    message: `A report covers at most ${MAX_REPORT_DAYS} days`,
  });
export type ReportQuery = z.output<typeof reportQuerySchema>;
