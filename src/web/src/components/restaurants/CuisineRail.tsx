import Link from 'next/link';
import type { CuisineCount } from '@/lib/api/types';
import { cuisineEmoji, cuisineLabel } from '@/lib/cuisines';
import { type ListingQuery, listingHref } from '@/lib/listing';

/** Round cuisine chips across the top of the list; the chosen one is filled in. */
export function CuisineRail({ cuisines, query }: { cuisines: CuisineCount[]; query: ListingQuery }) {
  if (!cuisines.length) return null;
  return (
    <nav aria-label="Cuisines" className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {cuisines.map(({ cuisine }) => {
        const active = query.cuisine === cuisine;
        return (
          <Link
            key={cuisine}
            href={listingHref(query, { cuisine: active ? undefined : cuisine })}
            aria-current={active ? 'true' : undefined}
            className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center text-xs font-semibold"
          >
            <span
              className={`flex size-16 items-center justify-center rounded-full text-3xl font-extrabold transition-colors ${
                active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
              }`}
            >
              {cuisineEmoji(cuisine) ?? cuisine.charAt(0).toUpperCase()}
            </span>
            <span className={active ? 'text-brand-600' : ''}>{cuisineLabel(cuisine)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
