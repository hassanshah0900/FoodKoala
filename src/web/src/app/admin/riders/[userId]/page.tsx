import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pager } from '@/components/admin/Pager';
import { SettlementForm } from '@/components/admin/SettlementForm';
import { StatusActions } from '@/components/admin/StatusActions';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Section } from '@/components/checkout/Section';
import { RatingLabel } from '@/components/restaurants/RatingLabel';
import { rupeesField } from '@/lib/amount';
import { getRider, riderEarnings, riderSettlements } from '@/lib/api/riders';
import { dateTime, rupees, shortDate } from '@/lib/format';
import { pageParam } from '@/lib/paging';
import { isUuid, one, type Params } from '@/lib/params';
import { formatPhone } from '@/lib/phone';
import { labelOf, RIDER_STATUSES, riderActions } from '@/lib/review';
import { requireAdmin } from '@/lib/session';
import { netText, settlementLabel, suggestedSettlement } from '@/lib/settlements';
import { changeRiderStatus, recordSettlement } from '../actions';

export const metadata: Metadata = { title: 'Rider' };

/** A rider's account: their status, the last week's work, and the cash and earnings to settle. */
export default async function AdminRider({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Params>;
}) {
  const { userId } = await params;
  const { token } = await requireAdmin(`/admin/riders/${userId}`);
  if (!isUuid(userId)) notFound();
  const page = pageParam(one((await searchParams).page));
  const rider = await getRider(token, userId);
  if (!rider) notFound();
  const [earnings, settlements] = await Promise.all([
    riderEarnings(token, userId),
    riderSettlements(token, userId, page),
  ]);
  const status = labelOf(RIDER_STATUSES, rider.status);
  const { period, balance } = earnings;
  const suggestion = suggestedSettlement(balance);

  return (
    <div className="space-y-6">
      <Link href={`/admin/riders?status=${rider.status}`} className="text-sm font-semibold text-brand-700">
        ← {status.label}
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{rider.name}</h1>
          <p className="text-muted">
            {formatPhone(rider.phone)} · <span className="capitalize">{rider.vehicle}</span> · {rider.city} · joined{' '}
            {shortDate(rider.createdAt)}
          </p>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
        {rider.status === 'approved' && (
          <StatusBadge label={rider.online ? 'Online' : 'Offline'} tone={rider.online ? 'good' : 'neutral'} />
        )}
        <RatingLabel rating={rider.rating} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Section title="Balance">
            <p className="mb-4 text-lg font-bold">{netText(balance.netPaisa)}</p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Figure label="Cash in hand" value={rupees(balance.cashInHandPaisa)} hint="Collected and not handed in" />
              <Figure
                label="Unpaid earnings"
                value={rupees(balance.unpaidEarningsPaisa)}
                hint="Earned and not paid out"
              />
            </dl>
          </Section>

          <Section title="Last 7 days">
            <dl className="grid gap-4 sm:grid-cols-4">
              <Figure label="Deliveries" value={String(period.deliveries)} />
              <Figure label="Delivery fees" value={rupees(period.deliveryFeesPaisa)} />
              <Figure label="Tips" value={rupees(period.tipsPaisa)} />
              <Figure label="Cash collected" value={rupees(period.cashCollectedPaisa)} />
            </dl>
          </Section>

          <Section title="Settlements">
            {settlements.items.length === 0 ? (
              <p className="text-sm text-muted">Nothing settled yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {settlements.items.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-3">
                    <span>
                      <span className="block font-semibold">{settlementLabel(s.kind)}</span>
                      {s.note && <span className="text-muted">{s.note}</span>}
                    </span>
                    <span className="text-right">
                      <span className="block font-bold">{rupees(s.amountPaisa)}</span>
                      <span className="text-muted">{dateTime(s.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <Pager page={settlements} path={`/admin/riders/${userId}`} params={{}} />
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Account">
            <StatusActions actions={riderActions(rider.status)} action={changeRiderStatus.bind(null, userId)} />
            <p className="mt-3 text-xs text-muted">
              A rider carrying an order can't be suspended until they drop it off.
            </p>
          </Section>
          <Section title="Settle up">
            <SettlementForm
              action={recordSettlement.bind(null, userId)}
              suggested={suggestion && { kind: suggestion.kind, amount: rupeesField(suggestion.amountPaisa) }}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-canvas p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-extrabold">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}
