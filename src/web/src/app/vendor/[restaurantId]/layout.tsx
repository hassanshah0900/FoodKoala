import type { Metadata } from 'next';
import Link from 'next/link';
import { ConsoleShell } from '@/components/console/ConsoleShell';
import { requireOwner } from '@/lib/owner';

export const metadata: Metadata = { title: { default: 'Orders', template: '%s · FoodKoala for restaurants' } };

/** The restaurant console: its sections, and a switch when the owner has more than one restaurant. */
export default async function VendorLayout({
  params,
  children,
}: {
  params: Promise<{ restaurantId: string }>;
  children: React.ReactNode;
}) {
  const { restaurantId } = await params;
  const { user, restaurant, restaurants } = await requireOwner(restaurantId);
  const base = `/vendor/${restaurant.id}`;
  const others = restaurants.filter((r) => r.id !== restaurant.id);

  return (
    <ConsoleShell
      badge="Partner"
      user={user}
      links={[
        { href: base, label: 'Orders', icon: 'bag', exact: true },
        { href: `${base}/history`, label: 'Past orders', icon: 'clock' },
        { href: `${base}/reports`, label: 'Sales', icon: 'chart' },
        { href: `${base}/menu`, label: 'Menu', icon: 'menu' },
        { href: `${base}/hours`, label: 'Opening hours', icon: 'calendar' },
        { href: `${base}/zones`, label: 'Delivery zones', icon: 'map' },
        { href: `${base}/details`, label: 'Restaurant details', icon: 'store' },
      ]}
      side={
        <details className="relative">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-brand-700">
            {others.length > 0 ? 'Switch restaurant' : 'Your restaurants'}
          </summary>
          <ul className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-line bg-white p-2 shadow-lg lg:static lg:w-auto lg:border-0 lg:p-0 lg:shadow-none">
            {others.map((r) => (
              <li key={r.id}>
                <Link href={`/vendor/${r.id}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-brand-50">
                  {r.name}
                  <span className="block text-xs text-muted">{r.address.area}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/vendor/new"
                className="block rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                + List another restaurant
              </Link>
            </li>
          </ul>
        </details>
      }
    >
      {children}
    </ConsoleShell>
  );
}
