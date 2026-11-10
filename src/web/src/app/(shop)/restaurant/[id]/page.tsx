import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CartPanel } from '@/components/menu/CartPanel';
import { MenuNav } from '@/components/menu/MenuNav';
import { MenuSections } from '@/components/menu/MenuSections';
import { MobileCartBar } from '@/components/menu/MobileCartBar';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { getMenu } from '@/lib/api/menus';
import { deliveryQuote, getRestaurant } from '@/lib/api/restaurants';
import { myFavourites } from '@/lib/api/users';
import { currentCart } from '@/lib/cart';
import { currentLocation } from '@/lib/current-location';
import { isUuid } from '@/lib/params';
import { accessToken } from '@/lib/session';

type Props = { params: Promise<{ id: string }> };

/** The restaurant, or 404 for an id that can't be one (the API would answer 400). */
async function load(id: string) {
  if (!isUuid(id)) notFound();
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
  const [restaurant, menu, quote, cart, token] = await Promise.all([
    load(id),
    getMenu(id),
    location ? deliveryQuote(id, location) : null,
    currentCart(),
    accessToken(),
  ]);
  // Favourites only set the heart, so the page still shows if user-service can't answer.
  const favourite = token
    ? await myFavourites(token)
        .then((fs) => fs.some((f) => f.restaurantId === id))
        .catch(() => false)
    : null;
  const categories = (menu?.categories ?? []).filter((c) => c.items.length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 lg:pb-10">
      <RestaurantHeader restaurant={restaurant} quote={quote} location={location} favourite={favourite} />
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
          signedIn={token !== null}
          className="sticky top-24 hidden w-[340px] shrink-0 lg:block"
        />
      </div>
      <MobileCartBar cart={cart?.restaurantId === id ? cart : null} />
    </div>
  );
}
