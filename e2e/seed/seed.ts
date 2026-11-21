// Fills the e2e stack with a demo: restaurants with menus around Gulberg,
// Lahore, riders, a voucher, and a customer with past orders and reviews.
// Everything goes through api-gateway, as the web app's calls do, so each
// service gets its data and Kafka events the normal way.
//
//   make e2e-up && cd e2e && npm run seed
//
// Safe to run again: whatever already exists is left alone.

import { randomUUID } from 'node:crypto';
import { call } from '../support/api.ts';
import { type Person, signIn } from '../support/people.ts';
import { near, squareAround } from '../support/places.ts';
import { FAVOURITES, GULBERG, ownerPhone, PAST_ORDERS, PHONES, SHOPS, type Shop } from './catalogue.ts';

const ALL_DAY = [{ opens: '00:00', closes: '24:00' }];
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** Every zone is a square this far to each side of its restaurant: wide enough to cover Gulberg and Model Town. */
const ZONE_KM = 6;
/** Where the rider waits for orders: within delivery-service's 5 km of every restaurant. */
const RIDER_SPOT = near(GULBERG, 100, 100);
const HOME = near(GULBERG, -350, 250);

const paisa = (rupees: number) => rupees * 100;
const log = (msg: string) => console.log(`  ${msg}`);

/** Calls the API, treating `status` (e.g. 409 for "exists") as done rather than as an error. */
async function callUnless<T>(status: number, ...args: Parameters<typeof call>): Promise<T | undefined> {
  try {
    return await call<T>(...args);
  } catch (e) {
    if (e instanceof Error && e.message.includes(`answered ${status}`)) return undefined;
    throw e;
  }
}

/** Retries `check` every second until it gives a value, for what arrives through Kafka. */
async function waitFor<T>(what: string, check: () => Promise<T | undefined>, seconds = 60): Promise<T> {
  for (let i = 0; i < seconds; i++) {
    const v = await check();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Gave up waiting for ${what}`);
}

interface MenuItem {
  id: string;
  name: string;
  optionGroups: { options: { id: string; name: string }[] }[];
}

interface Open {
  id: string;
  shop: Shop;
  owner: Person;
  items: MenuItem[];
}

/** A restaurant with its menu, hours and zone; approved unless the catalogue keeps it pending. */
async function restaurant(shop: Shop, n: number, admin: Person): Promise<Open> {
  const owner = await signIn(ownerPhone(n));
  const token = owner.accessToken;
  const mine = await call<{ id: string; name: string }[]>('GET', 'restaurants/mine', { token });
  const existing = mine.find((r) => r.name === shop.name);
  if (existing) {
    const menu = await call<{ categories: { items: MenuItem[] }[] }>('GET', `menus/restaurants/${existing.id}`);
    log(`${shop.name}: already there`);
    return { id: existing.id, shop, owner, items: menu.categories.flatMap((c) => c.items) };
  }

  const at = near(GULBERG, ...shop.offset);
  const r = await call<{ id: string }>('POST', 'restaurants', {
    token,
    body: {
      name: shop.name,
      description: shop.description,
      cuisines: shop.cuisines,
      phone: owner.phone,
      address: { line1: shop.line1, area: shop.area, city: 'Lahore', province: 'punjab' },
      location: at,
    },
  });

  const items: MenuItem[] = [];
  for (const { category, items: list } of shop.menu) {
    const c = await call<{ id: string }>('POST', `menus/restaurants/${r.id}/categories`, {
      token,
      body: { name: category },
    });
    for (const item of list) {
      items.push(
        await call<MenuItem>('POST', `menus/categories/${c.id}/items`, {
          token,
          body: {
            name: item.name,
            ...(item.description ? { description: item.description } : {}),
            pricePaisa: paisa(item.price),
            isAvailable: !item.soldOut,
            optionGroups: item.optionGroups ?? [],
          },
        }),
      );
    }
  }

  await call('PUT', `restaurants/${r.id}/hours`, {
    token,
    body: { weekly: Object.fromEntries(WEEK.map((d) => [d, ALL_DAY])), special: [] },
  });
  await call('POST', `restaurants/${r.id}/zones`, {
    token,
    body: {
      name: 'Gulberg and around',
      area: squareAround(at, ZONE_KM),
      deliveryFeePaisa: paisa(shop.deliveryFee),
      minimumOrderPaisa: paisa(shop.minimumOrder),
      deliveryTimeMinutes: shop.deliveryMinutes,
    },
  });
  if (!shop.pending) {
    await call('POST', `restaurants/${r.id}/status`, { token: admin.accessToken, body: { status: 'approved' } });
  }
  log(`${shop.name}: ${shop.pending ? 'applied, waiting for approval' : 'open'}`);
  return { id: r.id, shop, owner, items };
}

/** A rider who has applied; approved and on shift at RIDER_SPOT when `approve`. */
async function rider(phone: string, name: string, admin: Person, approve: boolean): Promise<Person> {
  const p = await signIn(phone);
  const exists = await callUnless(404, 'GET', 'delivery/riders/me', { token: p.accessToken });
  if (!exists) {
    await call('POST', 'delivery/riders', {
      token: p.accessToken,
      body: { name, vehicle: 'motorbike', city: 'Lahore' },
    });
    if (approve) {
      await call('POST', `delivery/riders/${p.userId}/status`, {
        token: admin.accessToken,
        body: { status: 'approved' },
      });
    }
  }
  if (approve) {
    await callUnless(409, 'POST', 'delivery/riders/me/online', {
      token: p.accessToken,
      body: { location: RIDER_SPOT },
    });
  }
  log(`${name}: ${approve ? 'approved, on shift' : 'applied, waiting for approval'}`);
  return p;
}

async function voucher(admin: Person) {
  const now = Date.now();
  await callUnless(409, 'POST', 'orders/vouchers', {
    token: admin.accessToken,
    body: {
      code: 'KOALA20',
      description: '20% off, up to Rs 300',
      kind: 'percent',
      value: 20,
      maxDiscountPaisa: paisa(300),
      minSubtotalPaisa: paisa(500),
      perCustomerLimit: 5,
      startsAt: new Date(now - 86_400_000).toISOString(),
      endsAt: new Date(now + 90 * 86_400_000).toISOString(),
    },
  });
  log('Voucher KOALA20: 20% off');
}

/** The customer's name, a saved home address and favourites. Returns the address id. */
async function customerProfile(customer: Person, shops: Open[]): Promise<string> {
  const token = customer.accessToken;
  await call('GET', 'users/me', { token });
  await call('PATCH', 'users/me', { token, body: { name: 'Ayesha Khan' } });
  const saved = await call<{ id: string }[]>('GET', 'users/me/addresses', { token });
  const addressId =
    saved[0]?.id ??
    (
      await call<{ id: string }>('POST', 'users/me/addresses', {
        token,
        body: {
          label: 'home',
          line1: 'House 18, Street 4, Block C',
          area: 'Gulberg III',
          city: 'Lahore',
          landmark: 'Hussain Chowk',
          instructions: 'Ring the bell twice',
          location: HOME,
          isDefault: true,
        },
      })
    ).id;
  for (const name of FAVOURITES) {
    const shop = shops.find((s) => s.shop.name === name);
    if (shop) await call('PUT', `users/me/favourites/${shop.id}`, { token });
  }
  log('Ayesha Khan: home address in Gulberg III, two favourites');
  return addressId;
}

/** One order from cart to door: checkout, kitchen, rider, review. */
async function pastOrder(
  o: (typeof PAST_ORDERS)[number],
  shop: Open,
  customer: Person,
  riderP: Person,
  addressId: string,
) {
  const token = customer.accessToken;
  await callUnless(404, 'DELETE', 'cart', { token });
  for (const line of o.lines) {
    const item = shop.items.find((i) => i.name === line.item);
    if (!item) throw new Error(`${line.item} isn't on ${shop.shop.name}'s menu`);
    const options = item.optionGroups.flatMap((g) => g.options);
    const optionIds = (line.choices ?? []).map((c) => {
      const opt = options.find((x) => x.name === c);
      if (!opt) throw new Error(`${line.item} has no choice ${c}`);
      return opt.id;
    });
    await call('POST', 'cart/items', {
      token,
      body: { restaurantId: shop.id, itemId: item.id, quantity: line.quantity, optionIds },
    });
  }

  const order = await call<{ id: string }>('POST', 'orders', {
    token,
    headers: { 'idempotency-key': randomUUID() },
    body: {
      addressId,
      paymentMethod: 'cod',
      ...(o.voucher ? { voucherCode: o.voucher } : {}),
      ...(o.tip ? { tipPaisa: paisa(o.tip) } : {}),
    },
  });

  const kitchen = shop.owner.accessToken;
  await call('POST', `orders/${order.id}/status`, {
    token: kitchen,
    body: { status: 'accepted', prepTimeMinutes: 15 },
  });
  await call('POST', `orders/${order.id}/status`, { token: kitchen, body: { status: 'ready' } });

  // delivery-service offers it to the nearest rider with a fresh location.
  const r = riderP.accessToken;
  const delivery = await waitFor('a rider to be assigned', async () => {
    await call('PUT', 'delivery/riders/me/location', { token: r, body: RIDER_SPOT });
    const d = await callUnless<{ id: string; orderId: string }>(404, 'GET', 'delivery/riders/me/delivery', {
      token: r,
    });
    return d?.orderId === order.id ? d : undefined;
  });
  await call('POST', `delivery/deliveries/${delivery.id}/pickup`, { token: r });
  await call('POST', `delivery/deliveries/${delivery.id}/dropoff`, { token: r });

  await waitFor('the order to be delivered', async () => {
    const now = await call<{ status: string }>('GET', `orders/${order.id}`, { token });
    return now.status === 'delivered' ? true : undefined;
  });
  await call('POST', `orders/${order.id}/review`, {
    token,
    body: { restaurantRating: o.review.restaurant, riderRating: o.review.rider, comment: o.review.comment },
  });
  log(`Order from ${shop.shop.name}: delivered and rated ${o.review.restaurant}★`);
}

async function main() {
  console.log('Seeding the demo through', process.env.E2E_API_URL ?? 'http://localhost:8080');
  const admin = await signIn(PHONES.admin);

  console.log('Restaurants');
  const shops: Open[] = [];
  for (const [i, shop] of SHOPS.entries()) shops.push(await restaurant(shop, i + 1, admin));

  console.log('Riders');
  const riderP = await rider(PHONES.rider, 'Bilal Ahmed', admin, true);
  await rider(PHONES.pendingRider, 'Usman Tariq', admin, false);

  console.log('Vouchers');
  await voucher(admin);

  console.log('Customer');
  const customer = await signIn(PHONES.customer);
  const addressId = await customerProfile(customer, shops);
  const history = await call<{ items: unknown[] }>('GET', 'orders', { token: customer.accessToken });
  if (history.items.length > 0) {
    log(`Past orders: already there (${history.items.length})`);
  } else {
    for (const o of PAST_ORDERS) {
      const shop = shops.find((s) => s.shop.name === o.shop);
      if (!shop) throw new Error(`${o.shop} isn't in the catalogue`);
      await pastOrder(o, shop, customer, riderP, addressId);
    }
    // Part of the cash Bilal collected, handed in, so his balance shows a settlement.
    await call('POST', `delivery/riders/${riderP.userId}/settlements`, {
      token: admin.accessToken,
      body: { kind: 'cash_deposit', amountPaisa: paisa(3000), note: 'Handed in at the Gulberg hub' },
    });
    log('Bilal handed in Rs 3,000 of the cash he collected');
  }

  console.log(`
Done. Open http://localhost:3000 and pick "Gulberg, Lahore". Sign in with any of
these; the login code is at http://localhost:4010/messages?to=<number>:

  Customer (Ayesha)     ${PHONES.customer}
  Rider (Bilal)         ${PHONES.rider}
  Admin                 ${PHONES.admin}
  Restaurant owners     ${ownerPhone(1)} (${SHOPS[0].name}) … ${ownerPhone(SHOPS.length)} (${SHOPS.at(-1)?.name})
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
