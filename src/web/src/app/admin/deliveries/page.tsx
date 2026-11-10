import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/admin/Pager';
import { StatusTabs } from '@/components/admin/StatusTabs';
import { Table } from '@/components/admin/Table';
import { deliveriesWithStatus } from '@/lib/api/delivery';
import { dateTime, rupees } from '@/lib/format';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { DELIVERY_STATUSES } from '@/lib/review';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Deliveries' };

/** Deliveries by where they are; "looking for a rider" is the one to watch. */
export default async function AdminDeliveries({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = DELIVERY_STATUSES.find((s) => s.status === one(params.status))?.status ?? 'searching';
  const { token } = await requireAdmin(`/admin/deliveries?status=${status}`);
  const page = await deliveriesWithStatus(token, status, pageParam(one(params.page)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Deliveries</h1>
        <Link href="/admin/orders" className="text-sm font-bold text-brand-700">
          Find an order →
        </Link>
      </div>
      <StatusTabs path="/admin/deliveries" tabs={DELIVERY_STATUSES} current={status} />
      <Table
        columns={['Order', 'From', 'To', 'Rider', 'Cash', 'Since']}
        empty={page.items.length ? null : 'No deliveries here.'}
      >
        {page.items.map((d) => (
          <tr key={d.id} className="hover:bg-brand-50/40">
            <td>
              <Link href={`/admin/orders/${d.orderId}`} className="font-mono font-bold text-brand-700 hover:underline">
                #{d.orderId.slice(0, 8).toUpperCase()}
              </Link>
            </td>
            <td>{d.restaurant.name}</td>
            <td className="max-w-xs">{d.dropoff.text}</td>
            <td>
              {d.rider ? (
                <Link href={`/admin/riders/${d.rider.userId}`} className="text-brand-700 hover:underline">
                  {d.rider.name}
                </Link>
              ) : (
                <span className="text-muted">None yet</span>
              )}
            </td>
            <td className="whitespace-nowrap">{d.cashToCollectPaisa ? rupees(d.cashToCollectPaisa) : '—'}</td>
            <td className="whitespace-nowrap text-muted">{dateTime(d.createdAt)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={page} path="/admin/deliveries" params={{ status }} />
    </div>
  );
}
