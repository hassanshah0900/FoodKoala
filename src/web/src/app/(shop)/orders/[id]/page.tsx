import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/orders/AutoRefresh';
import { LiveTracking } from '@/components/orders/LiveTracking';
import { OrderAgain } from '@/components/orders/OrderAgain';
import { OrderLines } from '@/components/orders/OrderLines';
import { ReviewForm } from '@/components/orders/ReviewForm';
import { Stars } from '@/components/orders/Stars';
import { StatusTracker } from '@/components/orders/StatusTracker';
import { addressTitle } from '@/lib/addresses';
import { getOrder, orderReview } from '@/lib/api/orders';
import { getTracking } from '@/lib/api/tracking';
import { rupees } from '@/lib/format';
import { isFinal } from '@/lib/order-status';
import { isUuid } from '@/lib/params';
import { canReview, riderDelivered } from '@/lib/reviews';
import { accessToken, requireUser } from '@/lib/session';
import { showTracking } from '@/lib/tracking';
import { orderAgain, rateOrder } from '../actions';

export const metadata: Metadata = { title: 'Your order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/orders/${id}`);
  if (!isUuid(id)) notFound();
  const token = (await accessToken())!;
  const [order, review, tracking] = await Promise.all([
    getOrder(token, id),
    orderReview(token, id),
    // The map is extra: if tracking-service is down the order page still shows.
    getTracking(token, id).catch(() => null),
  ]);
  if (!order) notFound();
  const a = order.deliveryAddress;
  const withRider = riderDelivered(order);
  const live = !isFinal(order.status) && tracking && showTracking(tracking) ? tracking : null;

  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {!isFinal(order.status) && <AutoRefresh seconds={15} />}
        <StatusTracker order={order} withArrival={!live?.eta} />
        {live && <LiveTracking initial={live} />}
        {order.status === 'delivered' && (
          <section id="rate" className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
            {review ? (
              <>
                <h2 className="text-lg font-bold">Your rating</h2>
                <p className="flex items-center gap-2 text-sm">
                  Food <Stars value={review.restaurantRating} />
                  {review.riderRating !== null && (
                    <>
                      <span className="ml-3">Rider</span> <Stars value={review.riderRating} />
                    </>
                  )}
                </p>
                {review.comment && <p className="text-sm text-muted">“{review.comment}”</p>}
              </>
            ) : canReview(order) ? (
              <>
                <h2 className="text-lg font-bold">How was it?</h2>
                <ReviewForm action={rateOrder.bind(null, order.id, withRider)} withRider={withRider} />
              </>
            ) : null}
            <div className="border-t border-line pt-4">
              <OrderAgain action={orderAgain.bind(null, order.id)} />
            </div>
          </section>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">
              <Link href={`/restaurant/${order.restaurant.id}`} className="hover:text-brand-600">
                {order.restaurant.name}
              </Link>
            </h2>
            <p className="text-xs text-muted">Order #{order.id.slice(0, 8).toUpperCase()}</p>
            <div className="mt-4">
              <OrderLines order={order} />
            </div>
          </section>
          <section className="space-y-4 rounded-xl bg-white p-6 text-sm shadow-sm">
            <div>
              <h2 className="text-lg font-bold">Delivering to</h2>
              <p className="mt-1 font-semibold">{addressTitle({ label: a.label as never, labelText: null })}</p>
              <p className="text-muted">
                {a.line1}, {a.area}, {a.city}
              </p>
              {a.instructions && <p className="text-muted">Note for the rider: {a.instructions}</p>}
            </div>
            <div>
              <h2 className="text-lg font-bold">Payment</h2>
              <p className="mt-1">
                {order.paymentMethod === 'cod' ? `Cash on delivery: ${rupees(order.totalPaisa)}` : order.paymentMethod}
              </p>
              {order.voucherCode && <p className="text-muted">Voucher {order.voucherCode}</p>}
            </div>
            {order.note && (
              <div>
                <h2 className="text-lg font-bold">Note for the restaurant</h2>
                <p className="mt-1 text-muted">{order.note}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
