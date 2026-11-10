import Link from 'next/link';
import type { Cart } from '@/lib/api/types';
import { rupees } from '@/lib/format';

/** On phones, where the cart panel doesn't fit beside the menu: a bar at the bottom that opens /cart. */
export function MobileCartBar({ cart }: { cart: Cart | null }) {
  if (!cart?.lines.length) return null;
  const items = cart.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 lg:hidden">
      <Link
        href="/cart"
        className="flex h-12 items-center justify-between rounded-lg bg-brand-600 px-4 font-bold text-white hover:bg-brand-700"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-sm">{items}</span>
        <span>View your cart</span>
        <span>{rupees(cart.subtotalPaisa)}</span>
      </Link>
    </div>
  );
}
