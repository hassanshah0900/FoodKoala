// What a test needs to exist before its story starts, made through the API
// rather than the browser: a restaurant taking orders and a rider on shift.
// The journeys that create these through the app have their own tests.

import { call } from './api.ts';
import { type Person, signIn, signInAdmin } from './people.ts';
import { near, newSpot, type Point, squareAround } from './places.ts';

export interface Restaurant {
  id: string;
  name: string;
  owner: Person;
  at: Point;
  /** An item with a required choice, and one without. */
  biryani: string;
  raita: string;
}

const ALL_DAY = [{ opens: '00:00', closes: '24:00' }];

/** An approved restaurant at a new spot, open all day every day, delivering 3 km around it. */
export async function openRestaurant(at: Point = newSpot()): Promise<Restaurant> {
  const owner = await signIn();
  const token = owner.accessToken;
  const name = `Koala Kitchen ${owner.phone.slice(-4)}`;
  const r = await call<{ id: string }>('POST', 'restaurants', {
    token,
    body: {
      name,
      description: 'Biryani and karahi, made to order.',
      cuisines: ['biryani', 'pakistani'],
      phone: owner.phone,
      address: { line1: 'Shop 4, Main Boulevard', area: 'Model Town', city: 'Testpur', province: 'punjab' },
      location: at,
    },
  });

  const category = await call<{ id: string }>('POST', `menus/restaurants/${r.id}/categories`, {
    token,
    body: { name: 'Rice' },
  });
  const biryani = 'Chicken Biryani';
  const raita = 'Raita';
  await call('POST', `menus/categories/${category.id}/items`, {
    token,
    body: {
      name: biryani,
      pricePaisa: 65000,
      optionGroups: [
        {
          name: 'Size',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Single', pricePaisa: 0 },
            { name: 'Full', pricePaisa: 30000 },
          ],
        },
      ],
    },
  });
  await call('POST', `menus/categories/${category.id}/items`, { token, body: { name: raita, pricePaisa: 8000 } });

  const weekly = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ALL_DAY]));
  await call('PUT', `restaurants/${r.id}/hours`, { token, body: { weekly, special: [] } });
  await call('POST', `restaurants/${r.id}/zones`, {
    token,
    body: {
      name: 'Nearby',
      area: squareAround(at, 3),
      deliveryFeePaisa: 9900,
      minimumOrderPaisa: 0,
      deliveryTimeMinutes: 30,
    },
  });

  const admin = await signInAdmin();
  await call('POST', `restaurants/${r.id}/status`, { token: admin.accessToken, body: { status: 'approved' } });
  return { id: r.id, name, owner, at, biryani, raita };
}

/** An approved rider, on shift a few hundred metres from `at`. */
export async function riderOnShift(at: Point): Promise<Person & { name: string }> {
  const rider = await signIn();
  const name = `Rashid ${rider.phone.slice(-4)}`;
  await call('POST', 'delivery/riders', {
    token: rider.accessToken,
    body: { name, vehicle: 'motorbike', city: 'Testpur' },
  });
  const admin = await signInAdmin();
  await call('POST', `delivery/riders/${rider.userId}/status`, {
    token: admin.accessToken,
    body: { status: 'approved' },
  });
  await call('POST', 'delivery/riders/me/online', {
    token: rider.accessToken,
    body: { location: near(at, 300, 200) },
  });
  return { ...rider, name };
}
