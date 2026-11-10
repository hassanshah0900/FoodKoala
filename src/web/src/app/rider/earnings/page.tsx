import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pager } from '@/components/console/Pager';
import { myEarnings, myRider, mySettlements } from '@/lib/api/delivery';
import { dateTime, rupees } from '@/lib/format';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { periodOf } from '@/lib/reports';
import { accessToken, requireUser } from '@/lib/session';
import { netText, settlementLabel } from '@/lib/settlements';

export const metadata: Metadata = { title: 'Earnings' };

const PERIODS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];

/** What the rider has earned, the cash they hold, and what has been settled with FoodKoala. */
export default async function RiderEarnings({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser('/rider/earnings');
  const token = (await accessToken())!;
  const rider = await myRider(token);
  if (!rider || rider.status === 'pending') redirect('/rider');
  const params = await searchParams;
  const days = PERIODS.find((p) => String(p.days) === one(params.days))?.days ?? 1;
  const period = periodOf(days);
  const [{ period: e, balance }, settlements] = await Promise.all([
    myEarnings(token, period.from, period.to),
    mySettlements(token, pageParam(one(params.page))),
  ]);

  return (
    <>
      <nav aria-label="Period" className="flex gap-1 rounded-full bg-white p-1 shadow-sm">
        {PERIODS.map((p) => (
          <Link
            key={p.days}
            href={`/rider/earnings?days=${p.days}`}
            aria-current={p.days === days ? 'page' : undefined}
            className={`flex-1 rounded-full py-2 text-center text-sm font-semibold ${
              p.days === days ? 'bg-brand-600 text-white' : 'text-muted'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-muted">You earned</p>
        <p className="text-5xl font-semibold">{rupees(e.earnedPaisa)}</p>
        <p className="mt-1 text-sm text-muted">
          {e.deliveries} {e.deliveries === 1 ? 'delivery' : 'deliveries'}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          {[
            ['Delivery fees', e.deliveryFeesPaisa],
            ['Tips', e.tipsPaisa],
            ['Cash collected', e.cashCollectedPaisa],
          ].map(([label, paisa]) => (
            <div key={label} className="rounded-xl bg-canvas p-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-bold">{rupees(paisa as number)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-bold">Your balance</h2>
        <p className={`mt-1 text-lg font-extrabold ${balance.netPaisa < 0 ? 'text-amber-800' : 'text-green-700'}`}>
          {netText(balance.netPaisa, 'rider')}
        </p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Cash you hold</dt>
            <dd className="font-semibold">{rupees(balance.cashInHandPaisa)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Earnings not paid yet</dt>
            <dd className="font-semibold">{rupees(balance.unpaidEarningsPaisa)}</dd>
          </div>
        </dl>
        {balance.cashInHandPaisa > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            Hand in the cash at a FoodKoala office; you can keep your earnings out of it.
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 font-bold">Settlements</h2>
        {settlements.items.length === 0 ? (
          <p className="text-sm text-muted">Nothing settled yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {settlements.items.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="block font-semibold">{settlementLabel(s.kind)}</span>
                  <span className="text-muted">{dateTime(s.createdAt)}</span>
                </span>
                <span className="font-bold">{rupees(s.amountPaisa)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Pager page={settlements} path="/rider/earnings" params={{ days: String(days) }} />
        </div>
      </section>
    </>
  );
}
