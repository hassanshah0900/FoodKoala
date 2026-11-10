import type { Metadata } from 'next';
import { WaitingCard } from '@/components/admin/WaitingCard';
import { restaurantsWithStatus } from '@/lib/api/restaurants';
import { shortDate } from '@/lib/format';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Overview' };

/** What is waiting for an admin, oldest first. */
export default async function AdminOverview() {
  const { token } = await requireAdmin('/admin');
  const restaurants = await restaurantsWithStatus(token, 'pending');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Overview</h1>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <WaitingCard
          title="Restaurants waiting for review"
          page={restaurants}
          row={(r) => ({
            key: r.id,
            href: `/admin/restaurants/${r.id}`,
            label: r.name,
            meta: `applied ${shortDate(r.createdAt)}`,
          })}
          more={{ href: '/admin/restaurants', label: 'Review applications' }}
        />
      </div>
    </div>
  );
}
