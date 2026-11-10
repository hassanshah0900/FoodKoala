import type { Metadata } from 'next';
import Link from 'next/link';
import { Table } from '@/components/console/Table';
import { SalesChart } from '@/components/vendor/SalesChart';
import { StatTile } from '@/components/vendor/StatTile';
import { salesReport } from '@/lib/api/orders';
import { rupees } from '@/lib/format';
import { requireOwner } from '@/lib/owner';
import { one, type Params } from '@/lib/params';
import { change, everyDay, PERIODS, periodOf } from '@/lib/reports';

export const metadata: Metadata = { title: 'Sales' };

/** How the restaurant is selling: the period's headline figures, each day, and the dishes that sell most. */
export default async function Sales({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<Params>;
}) {
  const { restaurantId } = await params;
  const { token, restaurant } = await requireOwner(restaurantId);
  const wanted = one((await searchParams).days);
  const days = PERIODS.find((p) => String(p.days) === wanted)?.days ?? 7;
  const period = periodOf(days);
  const [now, before] = await Promise.all([
    salesReport(token, restaurant.id, period.from, period.to),
    salesReport(token, restaurant.id, period.previous.from, period.previous.to),
  ]);
  const lost = now.orders.cancelled + now.orders.rejected;
  const daily = everyDay(now);
  const base = `/vendor/${restaurant.id}/reports`;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Sales</h1>
          <p className="text-sm text-muted">
            Orders placed in the last {days} days, today included. Sales are the food of delivered orders.
          </p>
        </div>
        <nav aria-label="Period" className="flex gap-1 rounded-full bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={`${base}?days=${p.days}`}
              aria-current={p.days === days ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                p.days === days ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Sales" value={rupees(now.salesPaisa)} delta={change(now.salesPaisa, before.salesPaisa)} />
        <StatTile
          label="Delivered orders"
          value={now.orders.delivered.toLocaleString('en-PK')}
          delta={change(now.orders.delivered, before.orders.delivered)}
          note={`${now.orders.placed} placed`}
        />
        <StatTile
          label="Average order"
          value={now.averageOrderPaisa === null ? '—' : rupees(now.averageOrderPaisa)}
          delta={
            now.averageOrderPaisa === null || before.averageOrderPaisa === null
              ? null
              : change(now.averageOrderPaisa, before.averageOrderPaisa)
          }
        />
        <StatTile
          label="Average prep time"
          value={now.averagePrepMinutes === null ? '—' : `${now.averagePrepMinutes} min`}
          note="From accepting to ready, as you set it"
        />
        <StatTile
          label="Rejected or cancelled"
          value={lost.toLocaleString('en-PK')}
          delta={change(lost, before.orders.cancelled + before.orders.rejected)}
          upIsGood={false}
          note={`${now.orders.rejected} rejected · ${now.orders.cancelled} cancelled`}
        />
        <StatTile
          label="Voucher discounts"
          value={rupees(now.discountsPaisa)}
          note="Taken off delivered orders by FoodKoala vouchers"
        />
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-bold">Sales each day</h2>
        {now.orders.placed === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No orders in this period yet.</p>
        ) : (
          <>
            <SalesChart days={daily} />
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">Show as a table</summary>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-muted uppercase">
                  <tr>
                    <th className="py-1 font-semibold">Day</th>
                    <th className="py-1 font-semibold">Placed</th>
                    <th className="py-1 font-semibold">Delivered</th>
                    <th className="py-1 text-right font-semibold">Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {daily.map((d) => (
                    <tr key={d.date}>
                      <td className="py-1">{d.date}</td>
                      <td className="py-1">{d.placed}</td>
                      <td className="py-1">{d.delivered}</td>
                      <td className="py-1 text-right">{rupees(d.salesPaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Best sellers</h2>
        <Table columns={['Item', 'Sold', 'Sales']} empty={now.topItems.length ? null : 'Nothing delivered yet.'}>
          {now.topItems.map((t) => (
            <tr key={t.itemId}>
              <td className="font-semibold">{t.name}</td>
              <td>{t.quantity}</td>
              <td>{rupees(t.salesPaisa)}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
