import type { Metadata } from 'next';
import { Pager } from '@/components/console/Pager';
import { StatusBadge } from '@/components/console/StatusBadge';
import { Table } from '@/components/console/Table';
import { restaurantOrders } from '@/lib/api/orders';
import { dateTime, rupees } from '@/lib/format';
import { requireOwner } from '@/lib/owner';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { labelOf, ORDER_STATUSES } from '@/lib/review';

export const metadata: Metadata = { title: 'Past orders' };

export default async function PastOrders({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<Params>;
}) {
  const { restaurantId } = await params;
  const { token, restaurant } = await requireOwner(restaurantId);
  const page = await restaurantOrders(
    token,
    restaurant.id,
    ['picked_up', 'delivered', 'rejected', 'cancelled'],
    pageParam(one((await searchParams).page)),
    20,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Past orders</h1>
      <Table
        columns={['Order', 'Placed', 'Items', 'Food', '']}
        empty={page.items.length ? null : 'No past orders yet.'}
      >
        {page.items.map((o) => {
          const status = labelOf(ORDER_STATUSES, o.status);
          const reason = o.timeline.find((t) => t.status === o.status)?.reason;
          return (
            <tr key={o.id}>
              <td className="font-mono font-bold">#{o.id.slice(0, 8).toUpperCase()}</td>
              <td className="whitespace-nowrap text-muted">{dateTime(o.placedAt)}</td>
              <td>{o.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}</td>
              <td className="whitespace-nowrap font-semibold">{rupees(o.subtotalPaisa)}</td>
              <td>
                <StatusBadge label={status.label} tone={status.tone} />
                {reason && <span className="mt-1 block text-xs text-muted">{reason}</span>}
              </td>
            </tr>
          );
        })}
      </Table>
      <Pager page={page} path={`/vendor/${restaurant.id}/history`} params={{}} />
    </div>
  );
}
