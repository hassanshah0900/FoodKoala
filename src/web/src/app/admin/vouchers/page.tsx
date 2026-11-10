import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/admin/Pager';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Table } from '@/components/admin/Table';
import { VoucherActions } from '@/components/admin/VoucherActions';
import { listVouchers } from '@/lib/api/orders';
import { shortDate } from '@/lib/format';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { requireAdmin } from '@/lib/session';
import { toPktInput, voucherState, voucherTerms } from '@/lib/vouchers';
import { changeVoucher } from './actions';

export const metadata: Metadata = { title: 'Vouchers' };

export default async function AdminVouchers({ searchParams }: { searchParams: Promise<Params> }) {
  const { token } = await requireAdmin('/admin/vouchers');
  const page = await listVouchers(token, pageParam(one((await searchParams).page)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Vouchers</h1>
        <Link
          href="/admin/vouchers/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
        >
          New voucher
        </Link>
      </div>
      <Table
        columns={['Code', 'Gives', 'Used', 'Valid', '', '']}
        empty={page.items.length ? null : 'No vouchers yet. Create one for customers to apply at checkout.'}
      >
        {page.items.map((v) => {
          const state = voucherState(v);
          return (
            <tr key={v.id}>
              <td>
                <span className="block font-mono font-bold text-brand-700">{v.code}</span>
                <span className="text-muted">{v.description}</span>
              </td>
              <td>
                {voucherTerms(v)}
                <span className="block text-muted">
                  {[v.restaurantId && 'one restaurant', v.firstOrderOnly && 'first order only']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </td>
              <td className="whitespace-nowrap">
                {v.used}
                {v.usageLimit !== null && ` of ${v.usageLimit}`}
                <span className="block text-muted">{v.perCustomerLimit} per customer</span>
              </td>
              <td className="whitespace-nowrap">
                {shortDate(v.startsAt)} – {shortDate(v.endsAt)}
              </td>
              <td>
                <StatusBadge label={state.label} tone={state.tone} />
              </td>
              <td>
                <VoucherActions
                  action={changeVoucher.bind(null, v.id)}
                  active={v.active}
                  current={{
                    endsAt: toPktInput(v.endsAt),
                    usageLimit: v.usageLimit === null ? '' : String(v.usageLimit),
                    description: v.description,
                  }}
                />
              </td>
            </tr>
          );
        })}
      </Table>
      <Pager page={page} path="/admin/vouchers" params={{}} />
    </div>
  );
}
