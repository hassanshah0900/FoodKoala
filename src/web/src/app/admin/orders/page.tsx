import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Section } from '@/components/checkout/Section';
import { StatusBadge } from '@/components/console/StatusBadge';
import { Table } from '@/components/console/Table';
import { findOrdersByCode } from '@/lib/api/orders';
import type { Order } from '@/lib/api/types';
import { dateTime, rupees } from '@/lib/format';
import { orderCode, readOrderRef } from '@/lib/order-code';
import { one, type Params } from '@/lib/params';
import { labelOf, ORDER_STATUSES } from '@/lib/review';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Find an order' };

/** Finds an order by the short code or the whole id a customer, restaurant or rider reads out. */
export default async function FindOrder({ searchParams }: { searchParams: Promise<Params> }) {
  const { token } = await requireAdmin('/admin/orders');
  const typed = one((await searchParams).id);
  const ref = readOrderRef(typed);
  if (ref && 'id' in ref) redirect(`/admin/orders/${ref.id}`);
  const matches = ref ? (await findOrdersByCode(token, ref.code)).items : [];
  if (matches.length === 1) redirect(`/admin/orders/${matches[0].id}`);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-extrabold">Find an order</h1>
      <Section title="Order code or id">
        <form className="flex gap-2">
          <input
            name="id"
            required
            defaultValue={typed}
            placeholder="e.g. 950C29C4"
            aria-label="Order code or id"
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 font-mono text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
          >
            Find
          </button>
        </form>
        {typed && !ref && (
          <p className="mt-2 text-sm text-red-700">
            That isn't an order code. It has 8 letters and digits, like 950C29C4, or use the whole id.
          </p>
        )}
        {ref && matches.length === 0 && <p className="mt-2 text-sm text-red-700">No order has the code {ref.code}.</p>}
      </Section>
      {matches.length > 1 && <Matches orders={matches} />}
    </div>
  );
}

/** Several orders share the code: enough to tell them apart. */
function Matches({ orders }: { orders: Order[] }) {
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">{orders.length} orders have this code. Pick the one you mean.</p>
      <Table columns={['Order', 'Restaurant', 'Placed', 'Total', 'Status']} empty={null}>
        {orders.map((o) => {
          const status = labelOf(ORDER_STATUSES, o.status);
          return (
            <tr key={o.id} className="hover:bg-brand-50/40">
              <td>
                <Link href={`/admin/orders/${o.id}`} className="font-mono font-bold text-brand-700 hover:underline">
                  #{orderCode(o.id)}
                </Link>
                <p className="font-mono text-xs text-muted">{o.id}</p>
              </td>
              <td>{o.restaurant.name}</td>
              <td className="whitespace-nowrap text-muted">{dateTime(o.placedAt)}</td>
              <td className="font-semibold">{rupees(o.totalPaisa)}</td>
              <td>
                <StatusBadge label={status.label} tone={status.tone} />
              </td>
            </tr>
          );
        })}
      </Table>
    </section>
  );
}
