import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/console/Pager';
import { StatusTabs } from '@/components/console/StatusTabs';
import { Table } from '@/components/console/Table';
import { RatingLabel } from '@/components/restaurants/RatingLabel';
import { ridersWithStatus } from '@/lib/api/delivery';
import { shortDate } from '@/lib/format';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { formatPhone } from '@/lib/phone';
import { RIDER_STATUSES } from '@/lib/review';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Riders' };

export default async function AdminRiders({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = RIDER_STATUSES.find((s) => s.status === one(params.status))?.status ?? 'pending';
  const { token } = await requireAdmin(`/admin/riders?status=${status}`);
  const page = await ridersWithStatus(token, status, pageParam(one(params.page)));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Riders</h1>
      <StatusTabs path="/admin/riders" tabs={RIDER_STATUSES} current={status} />
      <Table
        columns={['Rider', 'City', 'Vehicle', 'Rating', status === 'pending' ? 'Applied' : 'Shift']}
        empty={page.items.length ? null : 'No riders here.'}
      >
        {page.items.map((r) => (
          <tr key={r.userId} className="hover:bg-brand-50/40">
            <td>
              <Link href={`/admin/riders/${r.userId}`} className="block">
                <span className="block font-bold text-brand-700 hover:underline">{r.name}</span>
                <span className="text-muted">{formatPhone(r.phone)}</span>
              </Link>
            </td>
            <td>{r.city}</td>
            <td className="capitalize">{r.vehicle}</td>
            <td>
              <RatingLabel rating={r.rating} />
            </td>
            <td className="whitespace-nowrap">
              {status === 'pending' ? shortDate(r.createdAt) : r.online ? 'Online' : 'Offline'}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} path="/admin/riders" params={{ status }} />
    </div>
  );
}
