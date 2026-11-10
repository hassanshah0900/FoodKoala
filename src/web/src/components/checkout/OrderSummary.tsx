import type { CartSummary } from '@/lib/cart-summary';
import { rupees } from '@/lib/format';

/** The money, line by line, as checkout and the order page show it. */
export function MoneyRows({
  s,
}: {
  s: Pick<CartSummary, 'subtotalPaisa' | 'deliveryFeePaisa' | 'discountPaisa' | 'tipPaisa' | 'totalPaisa'>;
}) {
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between ${strong ? 'pt-2 text-base font-bold' : ''}`}>
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <dl className="space-y-1.5 text-sm">
      {row('Subtotal', rupees(s.subtotalPaisa))}
      {row(
        'Delivery fee',
        s.deliveryFeePaisa === null ? '—' : s.deliveryFeePaisa === 0 ? 'Free' : rupees(s.deliveryFeePaisa),
      )}
      {s.discountPaisa > 0 && row('Voucher', `−${rupees(s.discountPaisa)}`)}
      {s.tipPaisa > 0 && row('Rider tip', rupees(s.tipPaisa))}
      {row('Total', rupees(s.totalPaisa), true)}
    </dl>
  );
}
