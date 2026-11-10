import { MoneyRows } from '@/components/checkout/OrderSummary';
import type { Order } from '@/lib/api/types';
import { rupees } from '@/lib/format';

/** What was ordered, then the money: subtotal, delivery, voucher, tip and total. */
export function OrderLines({ order }: { order: Order }) {
  return (
    <>
      <ul className="space-y-2 text-sm">
        {order.lines.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: an order's lines never change or reorder.
          <li key={i} className="flex justify-between gap-3">
            <span>
              {l.quantity} × {l.name}
              {l.options.length > 0 && (
                <span className="block text-xs text-muted">{l.options.map((o) => o.name).join(', ')}</span>
              )}
            </span>
            <span>{rupees(l.lineTotalPaisa)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-line pt-4">
        <MoneyRows s={order} />
      </div>
    </>
  );
}
