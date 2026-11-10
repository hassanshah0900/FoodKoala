import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

/** count(*) of the rows matching `where`, as a number (Postgres returns bigint as text). */
export const countWhere = (where: SQL) => sql<number>`count(*) filter (where ${where})`.mapWith(Number);

/** sum(column) of the rows matching `where`, 0 when none. */
export const sumWhere = (column: AnyColumn | SQL, where: SQL) =>
  sql<number>`coalesce(sum(${column}) filter (where ${where}), 0)`.mapWith(Number);
