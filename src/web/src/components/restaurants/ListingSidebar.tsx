import Link from 'next/link';
import type { CuisineCount } from '@/lib/api/types';
import { cuisineLabel } from '@/lib/cuisines';
import { type ListingQuery, listingHref, SORTS } from '@/lib/listing';

function Option({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'true' : undefined} className="flex items-center gap-3 py-1.5 text-sm">
      <span
        className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 ${
          active ? 'border-brand-600' : 'border-neutral-300'
        }`}
      >
        {active && <span className="size-2 rounded-full bg-brand-600" />}
      </span>
      <span className={active ? 'font-semibold' : ''}>{children}</span>
    </Link>
  );
}

/** Filters down the left of the list: sort order and cuisine. Plain links, so they work without JavaScript. */
export function ListingSidebar({ cuisines, query }: { cuisines: CuisineCount[]; query: ListingQuery }) {
  return (
    <aside className="hidden w-60 shrink-0 space-y-8 lg:block">
      <section>
        <h2 className="mb-2 text-lg font-bold">Sort by</h2>
        {SORTS.map((s) => (
          <Option key={s.value} href={listingHref(query, { sort: s.value })} active={query.sort === s.value}>
            {s.label}
          </Option>
        ))}
      </section>
      {cuisines.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Cuisines</h2>
          <Option href={listingHref(query, { cuisine: undefined })} active={!query.cuisine}>
            All cuisines
          </Option>
          {cuisines.slice(0, 15).map(({ cuisine, restaurants }) => (
            <Option key={cuisine} href={listingHref(query, { cuisine })} active={query.cuisine === cuisine}>
              {cuisineLabel(cuisine)} <span className="text-muted">({restaurants})</span>
            </Option>
          ))}
        </section>
      )}
    </aside>
  );
}
