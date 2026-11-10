import type { Order } from '@/lib/api/types';
import { clockTime } from '@/lib/format';
import { headline, isFinal, STEPS, stepsDone } from '@/lib/order-status';

/** The big status card: headline, arrival time and the row of steps. */
export function StatusTracker({ order }: { order: Order }) {
  const done = stepsDone(order.status);
  const stopped = order.status === 'rejected' || order.status === 'cancelled';
  const reason = stopped ? order.timeline.at(-1)?.reason : null;
  return (
    <section className={`rounded-xl p-6 text-white ${stopped ? 'bg-neutral-700' : 'bg-brand-600'}`}>
      <h1 className="text-2xl font-extrabold">{headline(order.status, order.restaurant.name)}</h1>
      {!isFinal(order.status) && (
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
