import type { Metadata } from 'next';
import { WaitingCard } from '@/components/admin/WaitingCard';
import { ridersWithStatus } from '@/lib/api/delivery';
import { restaurantsWithStatus } from '@/lib/api/restaurants';
import { shortDate } from '@/lib/format';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Overview' };

/** What is waiting for an admin, oldest first. */
export default async function AdminOverview() {
  const { token } = await requireAdmin('/admin');
  const [restaurants, riders] = await Promise.all([
    restaurantsWithStatus(token, 'pending'),
    ridersWithStatus(token, 'pending'),
  ]);

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
        <WaitingCard
          title="Riders waiting for approval"
          page={riders}
          row={(r) => ({
            key: r.userId,
            href: `/admin/riders/${r.userId}`,
            label: `${r.name}, ${r.city}`,
            meta: `applied ${shortDate(r.createdAt)}`,
          })}
          more={{ href: '/admin/riders', label: 'Review riders' }}
        />
      </div>
    </div>
  );
}
