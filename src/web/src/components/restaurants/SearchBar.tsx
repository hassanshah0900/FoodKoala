import { SearchIcon } from '@/components/icons';
import type { ListingQuery } from '@/lib/listing';

/** A plain GET form: the query lands in the URL, keeping the chosen cuisine and sort. */
export function SearchBar({ query }: { query: ListingQuery }) {
  return (
    <search>
      <form action="/restaurants" className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          maxLength={100}
          placeholder="Search for restaurants, cuisines and dishes"
          aria-label="Search restaurants and dishes"
          className="h-12 w-full rounded-full bg-canvas pr-4 pl-12 outline-none ring-brand-600 placeholder:text-muted focus:bg-white focus:ring-2"
        />
        {query.cuisine && <input type="hidden" name="cuisine" value={query.cuisine} />}
        {query.sort !== 'relevance' && <input type="hidden" name="sort" value={query.sort} />}
      </form>
    </search>
  );
}
