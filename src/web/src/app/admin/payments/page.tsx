import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/console/Pager';
import { StatusTabs } from '@/components/console/StatusTabs';
import { Table } from '@/components/console/Table';
import { paymentsWithStatus } from '@/lib/api/payments';
import { dateTime, rupees } from '@/lib/format';
import { orderCode } from '@/lib/order-code';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { PAYMENT_STATUSES } from '@/lib/review';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Payments' };

const METHODS = { cod: 'Cash on delivery', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'Easypaisa' };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = PAYMENT_STATUSES.find((s) => s.status === one(params.status))?.status ?? 'pending';
  const { token } = await requireAdmin(`/admin/payments?status=${status}`);
  const page = await paymentsWithStatus(token, status, pageParam(one(params.page)));
  const when = { pending: 'Placed', collected: 'Collected', cancelled: 'Cancelled' }[status];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Payments</h1>
      <StatusTabs path="/admin/payments" tabs={PAYMENT_STATUSES} current={status} />
      <Table columns={['Order', 'Method', 'Amount', when]} empty={page.items.length ? null : 'No payments here.'}>
        {page.items.map((p) => (
          <tr key={p.id} className="hover:bg-brand-50/40">
            <td>
              <Link href={`/admin/orders/${p.orderId}`} className="font-mono font-bold text-brand-700 hover:underline">
                #{orderCode(p.orderId)}
              </Link>
            </td>
            <td>{METHODS[p.method]}</td>
            <td className="font-semibold">{rupees(p.amountPaisa)}</td>
            <td className="whitespace-nowrap text-muted">
              {dateTime(
                status === 'collected' ? p.collectedAt! : status === 'cancelled' ? p.cancelledAt! : p.createdAt,
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} path="/admin/payments" params={{ status }} />
    </div>
  );
}
