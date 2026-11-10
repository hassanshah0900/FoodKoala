import type { Page } from './api/types';

/** How many a page holds, with "+" when there are more: "12", "20+". */
export const countLabel = (page: Page<unknown>) => `${page.items.length}${page.hasMore ? '+' : ''}`;

/** A list's own address with only the page changed, so its other filters stay. */
export function pageHref(path: string, params: Record<string, string | undefined>, page: number): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && k !== 'page') query.set(k, v);
  if (page > 1) query.set('page', String(page));
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** ?page=, as a whole number from 1. */
export const pageParam = (raw: string | undefined) => Math.max(1, Math.floor(Number(raw)) || 1);
