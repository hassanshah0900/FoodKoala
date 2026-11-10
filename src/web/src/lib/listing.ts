import { one, type Params } from './params';

/** The restaurant list's filters, read from and written to its URL. */
export const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'distance', label: 'Distance' },
  { value: 'rating', label: 'Top rated' },
] as const;
export type Sort = (typeof SORTS)[number]['value'];

export interface ListingQuery {
  q?: string;
  cuisine?: string;
  sort: Sort;
  page: number;
}

/** Unknown or out-of-range values fall back to the defaults instead of failing. */
export function parseListing(params: Params): ListingQuery {
  const sort = SORTS.find((s) => s.value === one(params.sort))?.value ?? 'relevance';
  const page = Number(one(params.page));
  return {
    q: one(params.q)?.slice(0, 100),
    cuisine: one(params.cuisine)?.slice(0, 50).toLowerCase(),
    sort,
    page: Number.isInteger(page) && page >= 1 && page <= 50 ? page : 1,
  };
}

/** The list's URL with some filters changed; changing a filter goes back to page 1. */
export function listingHref(current: ListingQuery, change: Partial<ListingQuery>): string {
  const next = { ...current, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.cuisine) params.set('cuisine', next.cuisine);
  if (next.sort !== 'relevance') params.set('sort', next.sort);
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query ? `/restaurants?${query}` : '/restaurants';
}
