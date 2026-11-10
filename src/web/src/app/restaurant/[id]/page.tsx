import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CartPanel } from '@/components/menu/CartPanel';
import { MenuNav } from '@/components/menu/MenuNav';
import { MenuSections } from '@/components/menu/MenuSections';
import { MobileCartBar } from '@/components/menu/MobileCartBar';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { getMenu } from '@/lib/api/menus';
import { deliveryQuote, getRestaurant } from '@/lib/api/restaurants';
import { currentCart } from '@/lib/cart';
import { currentLocation } from '@/lib/current-location';
import { currentUser } from '@/lib/session';

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The restaurant, or 404 for an id that can't be one (the API would answer 400). */
async function load(id: string) {
  if (!UUID.test(id)) notFound();
  const restaurant = await getRestaurant(id);
  if (!restaurant) notFound();
  return restaurant;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const restaurant = await load((await params).id);
  return { title: `${restaurant.name}, ${restaurant.address.area}`, description: restaurant.description ?? undefined };
}

export default async function RestaurantPage({ params }: Props) {
  const { id } = await params;
  const location = await currentLocation();
  const [restaurant, menu, quote, cart, user] = await Promise.all([
    load(id),
    getMenu(id),
    location ? deliveryQuote(id, location) : null,
    currentCart(),
    currentUser(),
  ]);
  const categories = (menu?.categories ?? []).filter((c) => c.items.length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 lg:pb-10">
      <RestaurantHeader restaurant={restaurant} quote={quote} location={location} />
      <div className="mt-6 flex gap-8">
        <div className="min-w-0 flex-1">
          <MenuNav categories={categories} />
          {categories.length ? (
            <MenuSections categories={categories} restaurantId={id} />
          ) : (
            <p className="py-16 text-center text-muted">This restaurant hasn't put up its menu yet.</p>
          )}
        </div>
        <CartPanel
          cart={cart}
          restaurantId={id}
          delivery={quote?.deliverable ? quote.delivery : null}
          signedIn={user !== null}
          className="sticky top-24 hidden w-[340px] shrink-0 lg:block"
        />
      </div>
      <MobileCartBar cart={cart?.restaurantId === id ? cart : null} />
    </div>
  );
}
