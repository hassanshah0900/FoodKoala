import { StatusBadge } from '@/components/console/StatusBadge';
import type { Order } from '@/lib/api/types';
import { ago, clockTime, rupees } from '@/lib/format';
import { minutesToAnswer, readyBy } from '@/lib/kitchen';
import { orderCode } from '@/lib/order-code';
import { formatPhone } from '@/lib/phone';

/** One order on the kitchen board: what to cook, for whom, and how long there is. */
export function Ticket({ order, now, children }: { order: Order; now: number; children: React.ReactNode }) {
  const left = order.status === 'placed' ? minutesToAnswer(order.placedAt, now) : null;
  const ready = readyBy(order);
  return (
    <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono font-bold">#{orderCode(order.id)}</h3>
          <p className="text-xs text-muted">
            {ago(order.placedAt, now)} · {formatPhone(order.customerPhone)}
          </p>
        </div>
        {left !== null && (
          <StatusBadge label={left > 0 ? `Answer in ${left} min` : 'Answer now'} tone={left > 3 ? 'waiting' : 'bad'} />
        )}
        {ready && order.status === 'accepted' && <StatusBadge label={`Ready by ${clockTime(ready)}`} tone="good" />}
      </header>
      <ul className="space-y-1 text-sm">
        {order.lines.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: an order's lines never change or reorder.
          <li key={i}>
            <span className="font-bold">{l.quantity} ×</span> {l.name}
            {l.options.length > 0 && (
              <span className="block pl-5 text-xs text-muted">{l.options.map((o) => o.name).join(', ')}</span>
            )}
            {l.note && <span className="block pl-5 text-xs text-amber-800">“{l.note}”</span>}
          </li>
        ))}
      </ul>
      {order.note && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Note: {order.note}</p>}
      <p className="flex justify-between border-t border-line pt-2 text-sm">
        <span className="text-muted">Food · {order.paymentMethod === 'cod' ? 'cash on delivery' : 'paid online'}</span>
        <span className="font-bold">{rupees(order.subtotalPaisa)}</span>
      </p>
      {children}
    </article>
  );
}
