import type { Metadata } from 'next';
import Link from 'next/link';
import { VoucherForm } from '@/components/admin/VoucherForm';
import { Section } from '@/components/checkout/Section';
import { allWithStatus } from '@/lib/api/restaurants';
import { requireAdmin } from '@/lib/session';
import { toPktInput } from '@/lib/vouchers';
import { addVoucher } from '../actions';

export const metadata: Metadata = { title: 'New voucher' };

const WEEK = 7 * 24 * 3600_000;

export default async function NewVoucher() {
  const { token } = await requireAdmin('/admin/vouchers/new');
  const restaurants = await allWithStatus(token, 'approved');
  const now = new Date().toISOString();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/vouchers" className="text-sm font-semibold text-brand-700">
        ← Vouchers
      </Link>
      <h1 className="text-2xl font-extrabold">New voucher</h1>
      <Section title="Terms">
        <VoucherForm
          action={addVoucher}
          restaurants={restaurants.map((r) => ({ id: r.id, name: r.name, area: r.address.area }))}
          defaults={{ startsAt: toPktInput(now), endsAt: toPktInput(new Date(Date.now() + WEEK).toISOString()) }}
        />
      </Section>
    </div>
  );
}
