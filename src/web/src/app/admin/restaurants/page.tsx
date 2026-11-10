import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/admin/Pager';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { Table } from '@/components/admin/Table';
import { Cover } from '@/components/restaurants/Cover';
import { restaurantsWithStatus } from '@/lib/api/restaurants';
import { cuisineLabel } from '@/lib/cuisines';
import { shortDate } from '@/lib/format';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { formatPhone } from '@/lib/phone';
import { RESTAURANT_STATUSES } from '@/lib/review';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Restaurants' };

export default async function AdminRestaurants({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = RESTAURANT_STATUSES.find((s) => s.status === one(params.status))?.status ?? 'pending';
  const { token } = await requireAdmin(`/admin/restaurants?status=${status}`);
  const page = await restaurantsWithStatus(token, status, pageParam(one(params.page)));
  const since = status === 'pending' ? 'Applied' : 'Since';
  const withReason = status === 'rejected' || status === 'suspended';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Restaurants</h1>
      <StatusTabs path="/admin/restaurants" tabs={RESTAURANT_STATUSES} current={status} />
      <Table
        columns={['Restaurant', 'Area', 'Phone', since, ...(withReason ? ['Reason'] : [])]}
        empty={page.items.length ? null : 'No restaurants here.'}
      >
        {page.items.map((r) => (
          <tr key={r.id} className="hover:bg-brand-50/40">
            <td>
              <Link href={`/admin/restaurants/${r.id}`} className="flex items-center gap-3">
                <Cover
                  name={r.name}
                  url={r.logoUrl}
                  cuisine={r.cuisines[0]}
                  className="size-10 shrink-0 rounded-lg text-xl"
                />
                <span>
                  <span className="block font-bold text-brand-700 hover:underline">{r.name}</span>
                  <span className="text-muted">{r.cuisines.map(cuisineLabel).join(', ')}</span>
                </span>
              </Link>
            </td>
            <td className="whitespace-nowrap">
              {r.address.area}, {r.address.city}
            </td>
            <td className="whitespace-nowrap">{formatPhone(r.phone)}</td>
            <td className="whitespace-nowrap">{shortDate(status === 'pending' ? r.createdAt : r.updatedAt)}</td>
            {withReason && <td className="max-w-xs text-muted">{r.statusReason}</td>}
          </tr>
        ))}
      </Table>
      <Pager page={page} path="/admin/restaurants" params={{ status }} />
    </div>
  );
}
