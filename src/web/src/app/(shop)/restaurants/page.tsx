import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CuisineRail } from '@/components/restaurants/CuisineRail';
import { ListingSidebar } from '@/components/restaurants/ListingSidebar';
import { RestaurantCard } from '@/components/restaurants/RestaurantCard';
import { SearchBar } from '@/components/restaurants/SearchBar';
import { cuisinesNear, searchRestaurants } from '@/lib/api/search';
import { cuisineLabel } from '@/lib/cuisines';
import { currentLocation } from '@/lib/current-location';
import { listingHref, parseListing } from '@/lib/listing';

export const metadata: Metadata = { title: 'Restaurants near you' };

export default async function Restaurants({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const location = await currentLocation();
  if (!location) redirect('/');
  const query = parseListing(await searchParams);
  const [results, cuisines] = await Promise.all([searchRestaurants(location, query), cuisinesNear(location)]);

  const heading = query.q
    ? `Results for “${query.q}”`
    : query.cuisine
      ? `${cuisineLabel(query.cuisine)} restaurants`
      : 'All restaurants';

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <SearchBar query={query} />
      <CuisineRail cuisines={cuisines} query={query} />
      <div className="flex gap-10">
        <ListingSidebar cuisines={cuisines} query={query} />
        <div className="min-w-0 flex-1">
          <h1 className="mb-4 text-2xl font-extrabold">{heading}</h1>
          {results.items.length === 0 ? (
            <div className="rounded-xl bg-canvas px-6 py-16 text-center">
              <p className="text-lg font-bold">No restaurants found</p>
              <p className="mt-1 text-sm text-muted">
                {query.q || query.cuisine
                  ? 'Try another search, or clear the filters.'
                  : `No restaurant delivers to ${location.label} yet. Try another area.`}
              </p>
              <Link
                href={query.q || query.cuisine ? '/restaurants' : '/'}
                className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700"
              >
                {query.q || query.cuisine ? 'Clear filters' : 'Change area'}
              </Link>
            </div>
          ) : (
            <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
              {results.items.map((r) => (
                <RestaurantCard key={r.id} restaurant={r} />
              ))}
            </div>
          )}
          {(query.page > 1 || results.hasMore) && (
            <nav aria-label="Pages" className="mt-10 flex justify-center gap-3">
              {query.page > 1 && (
                <Link
                  href={listingHref(query, { page: query.page - 1 })}
                  className="rounded-lg border border-line px-5 py-2.5 font-semibold hover:border-brand-600"
                >
                  Previous
                </Link>
              )}
              {results.hasMore && (
                <Link
                  href={listingHref(query, { page: query.page + 1 })}
                  className="rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700"
                >
                  More restaurants
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
