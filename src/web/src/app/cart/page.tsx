import type { Metadata } from 'next';
import Link from 'next/link';
import { CartPanel } from '@/components/menu/CartPanel';
import { deliveryQuote, getRestaurant } from '@/lib/api/restaurants';
import { currentCart } from '@/lib/cart';
import { currentLocation } from '@/lib/current-location';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Your cart' };

/** The cart on its own page, for phones (wide screens show it beside the menu). */
export default async function CartPage() {
  await requireUser('/cart');
  const [cart, location] = await Promise.all([currentCart(), currentLocation()]);
  const restaurantId = cart?.restaurantId ?? null;
  const [restaurant, quote] = restaurantId
    ? await Promise.all([getRestaurant(restaurantId), location ? deliveryQuote(restaurantId, location) : null])
    : [null, null];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      {restaurant && (
        <Link href={`/restaurant/${restaurant.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
          ← {restaurant.name}
        </Link>
      )}
      <CartPanel
        cart={cart}
        restaurantId={restaurantId ?? ''}
        delivery={quote?.deliverable ? quote.delivery : null}
        signedIn
      />
    </div>
  );
}
