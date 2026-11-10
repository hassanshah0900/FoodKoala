import Link from 'next/link';
import { changeQuantity } from '@/app/cart/actions';
import { BagIcon } from '@/components/icons';
import type { Cart, Delivery } from '@/lib/api/types';
import { summarize } from '@/lib/cart-summary';
import { rupees } from '@/lib/format';

function Empty({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <BagIcon className="size-10" />
      </span>
      <p className="mt-4 font-bold">Hungry?</p>
      <p className="mt-1 text-sm text-muted">
        {signedIn ? "You haven't added anything to your cart yet." : 'Log in to start adding food to your cart.'}
      </p>
    </div>
  );
}

/** − n + for a line, as two forms posting to a server action: no JavaScript needed. */
function Stepper({ restaurantId, lineId, quantity }: { restaurantId: string; lineId: string; quantity: number }) {
  const button = 'flex size-7 items-center justify-center rounded-full font-bold text-brand-600 hover:bg-brand-50';
  return (
    <div className="inline-flex items-center rounded-full border border-line">
      <form action={changeQuantity.bind(null, restaurantId, lineId, quantity - 1)}>
        <button type="submit" className={button} aria-label={quantity === 1 ? 'Remove' : 'One fewer'}>
          {quantity === 1 ? '🗑' : '−'}
        </button>
      </form>
      <span className="w-6 text-center text-sm font-bold">{quantity}</span>
      <form action={changeQuantity.bind(null, restaurantId, lineId, quantity + 1)}>
        <button type="submit" className={button} aria-label="One more" disabled={quantity >= 50}>
          +
        </button>
      </form>
    </div>
  );
}

/**
 * The cart: beside the menu on wide screens, the whole of /cart on phones.
 * `restaurantId` is the restaurant being looked at; a cart from another one
 * is pointed to instead of listed.
 */
export function CartPanel({
  cart,
  restaurantId,
  delivery,
  signedIn,
  className = '',
}: {
  cart: Cart | null;
  restaurantId: string;
  delivery: Delivery | null;
  signedIn: boolean;
  className?: string;
}) {
  const empty = !cart || cart.lines.length === 0;
  const elsewhere = !empty && cart.restaurantId !== restaurantId;
  return (
    <aside className={`h-fit rounded-xl border border-line p-6 shadow-sm ${className}`}>
      <h2 className="text-lg font-bold">Your cart</h2>
      {empty ? (
        <Empty signedIn={signedIn} />
      ) : elsewhere ? (
        <p className="py-8 text-center text-sm text-muted">
          Your cart has items from another restaurant.{' '}
          <Link href={`/restaurant/${cart.restaurantId}`} className="font-semibold text-brand-600 hover:underline">
            Go to it
          </Link>
          , or add something here to start a new cart.
        </p>
      ) : (
        <CartLines cart={cart} restaurantId={restaurantId} delivery={delivery} />
      )}
    </aside>
  );
}

function CartLines({ cart, restaurantId, delivery }: { cart: Cart; restaurantId: string; delivery: Delivery | null }) {
  const s = summarize(cart, delivery);
  const problems = new Map(cart.problems.map((p) => [p.lineId, p.message]));
  return (
    <>
      <ul className="mt-4 divide-y divide-line">
        {cart.lines.map((l) => (
          <li key={l.id} className="flex gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{l.name}</p>
              {l.options.length > 0 && <p className="text-xs text-muted">{l.options.map((o) => o.name).join(', ')}</p>}
              {l.note && <p className="text-xs text-muted italic">“{l.note}”</p>}
              {problems.has(l.id) && <p className="mt-1 text-xs font-semibold text-red-700">{problems.get(l.id)}</p>}
              <div className="mt-2">
                <Stepper restaurantId={restaurantId} lineId={l.id} quantity={l.quantity} />
              </div>
            </div>
            <p className="text-sm font-semibold">{rupees(l.lineTotalPaisa)}</p>
          </li>
        ))}
      </ul>
      <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd>{rupees(s.subtotalPaisa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Delivery fee</dt>
          <dd>{s.deliveryFeePaisa === null ? '—' : s.deliveryFeePaisa === 0 ? 'Free' : rupees(s.deliveryFeePaisa)}</dd>
        </div>
        <div className="flex justify-between pt-1 text-base font-bold">
          <dt>Total</dt>
          <dd>{rupees(s.totalPaisa)}</dd>
        </div>
      </dl>
      {s.shortOfMinimumPaisa > 0 && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800">
          Add {rupees(s.shortOfMinimumPaisa)} more to reach the minimum order.
        </p>
      )}
    </>
  );
}
