import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/console/Pager';
import { StatusBadge } from '@/components/console/StatusBadge';
import { OrderAgain } from '@/components/orders/OrderAgain';
import { Stars } from '@/components/orders/Stars';
import { myOrders, orderReview } from '@/lib/api/orders';
import { dateTime, rupees } from '@/lib/format';
import { isFinal } from '@/lib/order-status';
import { pageParam } from '@/lib/paging';
import { one, type Params } from '@/lib/params';
import { labelOf, ORDER_STATUSES } from '@/lib/review';
import { canReview } from '@/lib/reviews';
import { accessToken, requireUser } from '@/lib/session';
import { orderAgain } from './actions';

export const metadata: Metadata = { title: 'Your orders' };

/** Every order the customer placed, newest first: follow one, rate it, or order it again. */
export default async function YourOrders({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser('/orders');
  const token = (await accessToken())!;
  const page = await myOrders(token, pageParam(one((await searchParams).page)));
  // Delivered orders show their stars, or a nudge to rate them.
  const reviews = await Promise.all(
    page.items.map((o) => (o.status === 'delivered' ? orderReview(token, o.id) : Promise.resolve(null))),
  );

  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-extrabold">Your orders</h1>
        {page.items.length === 0 ? (
          <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm">
            <p className="font-semibold">No orders yet.</p>
            <Link href="/restaurants" className="mt-3 inline-block font-bold text-brand-700">
              Find something to eat →
            </Link>
          </div>
        ) : (
          page.items.map((o, i) => {
            const status = labelOf(ORDER_STATUSES, o.status);
            const review = reviews[i];
            return (
              <article key={o.id} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{o.restaurant.name}</h2>
                    <p className="text-sm text-muted">
                      {dateTime(o.placedAt)} · {rupees(o.totalPaisa)}
                    </p>
                  </div>
                  <StatusBadge label={status.label} tone={status.tone} />
                </div>
                <p className="text-sm">{o.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}</p>
                <div className="flex flex-wrap items-start gap-3">
                  <Link
                    href={`/orders/${o.id}`}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
                  >
                    {isFinal(o.status) ? 'See order' : 'Track order'}
                  </Link>
                  {o.status === 'delivered' && <OrderAgain action={orderAgain.bind(null, o.id)} />}
                  {review ? (
                    <span className="flex items-center gap-2 py-2 text-sm text-muted">
                      You rated it <Stars value={review.restaurantRating} />
                    </span>
                  ) : (
                    canReview(o) && (
                      <Link href={`/orders/${o.id}#rate`} className="py-2 text-sm font-bold text-brand-700">
                        Rate this order
                      </Link>
                    )
                  )}
                </div>
              </article>
            );
          })
        )}
        <Pager page={page} path="/orders" params={{}} />
      </div>
    </div>
  );
}
