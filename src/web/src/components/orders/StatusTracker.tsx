import type { Order } from '@/lib/api/types';
import { clockTime } from '@/lib/format';
import { headline, isFinal, STEPS, stepsDone } from '@/lib/order-status';
import { whenLabel } from '@/lib/schedule';

/**
 * The big status card: headline, arrival time and the row of steps. `withArrival` is off while the live
 * tracking card shows the rider's own arrival time, so the page doesn't give two.
 */
export function StatusTracker({ order, withArrival = true }: { order: Order; withArrival?: boolean }) {
  const done = stepsDone(order.status);
  const stopped = order.status === 'rejected' || order.status === 'cancelled';
  const reason = stopped ? order.timeline.at(-1)?.reason : null;
  // Scheduled and not yet with the kitchen: the time it is for matters more than the steps.
  const waitingFor = order.status === 'placed' && order.scheduledFor ? order.scheduledFor : null;
  return (
    <section className={`rounded-xl p-6 text-white ${stopped ? 'bg-neutral-700' : 'bg-brand-600'}`}>
      <h1 className="text-2xl font-extrabold">
        {waitingFor
          ? `Scheduled for ${whenLabel(waitingFor, Date.now())}`
          : headline(order.status, order.restaurant.name)}
      </h1>
      {waitingFor && (
        <p className="mt-1 text-brand-100">
          {order.restaurant.name} starts on it around {clockTime(order.releaseAt)}. You can cancel until they accept it.
        </p>
      )}
      {withArrival && !waitingFor && !isFinal(order.status) && (
        <p className="mt-1 text-brand-100">Arriving around {clockTime(order.estimatedDeliveryAt)}</p>
      )}
      {reason && <p className="mt-1 text-neutral-200">{reason}</p>}
      {!stopped && (
        <ol className="mt-6 grid grid-cols-5 gap-2">
          {STEPS.map((s, i) => (
            <li key={s.status} className="space-y-2">
              <span className={`block h-1.5 rounded-full ${i < done ? 'bg-white' : 'bg-white/25'}`} />
              <span className={`block text-xs ${i < done ? 'font-bold' : 'text-brand-200'}`}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
