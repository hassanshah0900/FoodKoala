import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/orders/AutoRefresh';
import { OrderLines } from '@/components/orders/OrderLines';
import { StatusTracker } from '@/components/orders/StatusTracker';
import { addressTitle } from '@/lib/addresses';
import { getOrder } from '@/lib/api/orders';
import { rupees } from '@/lib/format';
import { isFinal } from '@/lib/order-status';
import { isUuid } from '@/lib/params';
import { accessToken, requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Your order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/orders/${id}`);
  if (!isUuid(id)) notFound();
  const order = await getOrder((await accessToken())!, id);
  if (!order) notFound();
  const a = order.deliveryAddress;

  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {!isFinal(order.status) && <AutoRefresh seconds={15} />}
        <StatusTracker order={order} />
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
