import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/checkout/Section';
import { StatusActions } from '@/components/console/StatusActions';
import { StatusBadge } from '@/components/console/StatusBadge';
import { OrderLines } from '@/components/orders/OrderLines';
import { deliveryOfOrder } from '@/lib/api/delivery';
import { getOrder } from '@/lib/api/orders';
import { paymentOfOrder } from '@/lib/api/payments';
import { dateTime, rupees } from '@/lib/format';
import { isUuid } from '@/lib/params';
import { formatPhone } from '@/lib/phone';
import { DELIVERY_STATUSES, labelOf, ORDER_EVENTS, ORDER_STATUSES, orderActions, PAYMENT_STATUSES } from '@/lib/review';
import { requireAdmin } from '@/lib/session';
import { changeOrderStatus } from '../actions';

export const metadata: Metadata = { title: 'Order' };

/** One order across the services: what was ordered, its timeline, its delivery and its payment. */
export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token } = await requireAdmin(`/admin/orders/${id}`);
  if (!isUuid(id)) notFound();
  const [order, delivery, payment] = await Promise.all([
    getOrder(token, id),
    deliveryOfOrder(token, id),
    paymentOfOrder(token, id),
  ]);
  if (!order) notFound();
  const status = labelOf(ORDER_STATUSES, order.status);
  const actions = orderActions(order.status);
  const a = order.deliveryAddress;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
          <p className="text-muted">
            {order.restaurant.name} · placed {dateTime(order.placedAt)} · {formatPhone(order.customerPhone)}
          </p>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Section title="Ordered">
            <OrderLines order={order} />
            {order.voucherCode && <p className="mt-3 text-sm text-muted">Voucher {order.voucherCode}</p>}
            {order.note && <p className="mt-1 text-sm text-muted">Note for the restaurant: {order.note}</p>}
          </Section>

          <Section title="Timeline">
            <ol className="space-y-3 text-sm">
              {order.timeline.map((t) => (
                <li key={`${t.status}-${t.at}`} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-semibold">{ORDER_EVENTS[t.status]}</span>
                    <span className="text-muted"> by {t.by}</span>
                    {t.reason && <span className="block text-muted">“{t.reason}”</span>}
                  </span>
                  <span className="text-muted">{dateTime(t.at)}</span>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Delivery">
            <p className="text-sm">
              {a.line1}, {a.area}, {a.city}
              {a.landmark && <span className="text-muted"> · near {a.landmark}</span>}
            </p>
            {delivery ? (
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge {...labelOf(DELIVERY_STATUSES, delivery.status)} />
                </dd>
                <dt className="text-muted">Rider</dt>
                <dd>
                  {delivery.rider ? (
                    <Link href={`/admin/riders/${delivery.rider.userId}`} className="font-semibold text-brand-700">
                      {delivery.rider.name}, {formatPhone(delivery.rider.phone)}
                    </Link>
                  ) : (
                    'None yet'
                  )}
                </dd>
                <dt className="text-muted">Cash to collect</dt>
                <dd>{rupees(delivery.cashToCollectPaisa)}</dd>
                {(
                  [
                    ['Food ready', delivery.foodReadyAt],
                    ['Rider assigned', delivery.assignedAt],
                    ['Picked up', delivery.pickedUpAt],
                    ['Delivered', delivery.deliveredAt],
                    ['Cancelled', delivery.cancelledAt],
                  ] as const
                )
                  .filter(([, at]) => at)
                  .map(([label, at]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted">{label}</dt>
                      <dd>{dateTime(at!)}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted">No delivery for this order.</p>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Payment">
            {payment ? (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span>
                  <span className="block font-bold">{rupees(payment.amountPaisa)}</span>
                  <span className="text-muted">{payment.method === 'cod' ? 'Cash on delivery' : payment.method}</span>
                </span>
                <StatusBadge {...labelOf(PAYMENT_STATUSES, payment.status)} />
              </div>
            ) : (
              <p className="text-sm text-muted">No payment recorded yet.</p>
            )}
          </Section>
          <Section title="Step in">
            {actions.length === 0 ? (
              <p className="text-sm text-muted">This order is finished.</p>
            ) : (
              <StatusActions actions={actions} action={changeOrderStatus.bind(null, order.id)} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
