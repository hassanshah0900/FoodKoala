import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { myRestaurants } from './api/restaurants';
import type { ManagedRestaurant } from './api/types';
import { accessToken, requireUser } from './session';

/** The caller's restaurants, asked once per request however many layouts and pages want them. */
export const ownRestaurants = cache(async (here: string) => {
  const user = await requireUser(here);
  const token = (await accessToken())!;
  return { user, token, restaurants: await myRestaurants(token) };
});

/** The signed-in owner of this restaurant; anyone else gets a 404, as if it weren't there. */
export async function requireOwner(restaurantId: string): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  token: string;
  restaurant: ManagedRestaurant;
  restaurants: ManagedRestaurant[];
}> {
  const own = await ownRestaurants(`/vendor/${restaurantId}`);
  const restaurant = own.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) notFound();
  return { ...own, restaurant };
}
