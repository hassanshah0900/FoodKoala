import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KoalaMark } from '@/components/Logo';
import { ownRestaurants } from '@/lib/owner';

export const metadata: Metadata = { title: 'For restaurants' };

/** Straight to the owner's restaurant; someone without one is told how to get listed. */
export default async function Vendor() {
  const { restaurants } = await ownRestaurants('/vendor');
  if (restaurants.length > 0) redirect(`/vendor/${restaurants[0].id}`);
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-canvas px-4 py-24 text-center">
      <KoalaMark className="size-16 text-brand-300" />
      <h1 className="mt-4 text-2xl font-extrabold">You don't have a restaurant on FoodKoala yet</h1>
      <p className="mt-2 max-w-md text-muted">
        Once your restaurant is listed, this is where you take orders, keep your menu up to date and see your sales.
      </p>
      <Link
        href="/vendor/new"
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700"
      >
        List your restaurant
      </Link>
      <Link href="/" className="mt-3 text-sm font-semibold text-brand-700">
        Back to ordering
      </Link>
    </main>
  );
}
