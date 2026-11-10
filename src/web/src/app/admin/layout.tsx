import type { Metadata } from 'next';
import type { ConsoleLink } from '@/components/console/ConsoleNav';
import { ConsoleShell } from '@/components/console/ConsoleShell';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · FoodKoala admin' } };

const LINKS: ConsoleLink[] = [
  { href: '/admin', label: 'Overview', icon: 'grid', exact: true },
  { href: '/admin/restaurants', label: 'Restaurants', icon: 'store' },
  { href: '/admin/riders', label: 'Riders', icon: 'bike' },
  // An order's page belongs to Deliveries, where orders are found from.
  { href: '/admin/deliveries', label: 'Deliveries', icon: 'bag', also: ['/admin/orders'] },
  { href: '/admin/payments', label: 'Payments', icon: 'cash' },
  { href: '/admin/vouchers', label: 'Vouchers', icon: 'ticket' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin('/admin');
  return (
    <ConsoleShell badge="Admin" links={LINKS} user={user}>
      {children}
    </ConsoleShell>
  );
}
