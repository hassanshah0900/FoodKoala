import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../app.module';
import type { Cart } from '../clients/clients';
import type { Database } from '../db/database';
import { orders, outbox } from '../db/schema';
import { OrdersService } from '../orders/orders.service';
import { setupApp } from '../setup-app';

/** Helpers shared by the e2e specs: stand-ins for the services order-service calls, and the app. */

export type Headers = Record<'X-User-Id' | 'X-User-Phone' | 'X-User-Roles', string>;

export function newUser(roles = 'customer'): Headers {
  const phone = `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  return { 'X-User-Id': randomUUID(), 'X-User-Phone': phone, 'X-User-Roles': roles };
}

/** State of the stand-in cart, user and restaurant services. */
export const carts = new Map<string, Cart>();
const addresses = new Map<
  string,
  { ownerId: string; area: string; city: string; location: { lat: number; lng: number } }
>();
const restaurants = new Map<
  string,
  {
    name: string;
    ownerId: string;
    acceptingOrders: boolean;
    deliverable: boolean;
    /** Takes orders for later (a quote with `at`) even when closed now. */
    openLater?: boolean;
  }
>();
/** Set to make restaurant-service answer 503. */
export const outage = { restaurant: false };
/** Customers whose cart was emptied. */
export const cleared: string[] = [];

/** cart-service (GET/DELETE /), user-service (GET /me/addresses/{id}) and restaurant-service (GET /{id}, /{id}/delivery-quote). */
function fakeServices(): Server {
  return createServer((req, res) => {
    const send = (status: number, body?: unknown) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body));
    const userId = req.headers['x-user-id'] as string | undefined;
    const url = new URL(req.url!, 'http://fake');
    const [service, ...rest] = url.pathname.split('/').filter(Boolean);

    if (service === 'cart') {
      if (!userId) return send(401);
      if (req.method === 'DELETE') {
        carts.delete(userId);
        cleared.push(userId);
        return send(204);
      }
      return send(
        200,
        carts.get(userId) ?? { restaurantId: null, lines: [], subtotalPaisa: 0, problems: [], updatedAt: null },
      );
    }
    if (service === 'user') {
      const address = addresses.get(rest[2]);
      if (!userId || !address || address.ownerId !== userId) return send(404, { statusCode: 404 });
      return send(200, {
        id: rest[2],
        label: 'home',
        labelText: null,
        line1: 'House 7',
        landmark: null,
        instructions: null,
        isDefault: true,
        ...address,
      });
    }
    if (service === 'restaurant') {
      if (outage.restaurant) return send(503);
      const r = restaurants.get(rest[0]);
      if (!r) return send(404, { statusCode: 404 });
      if (rest[1] === 'delivery-quote') {
        return send(200, {
          deliverable: r.deliverable,
          acceptingOrders: url.searchParams.has('at') && r.openLater !== undefined ? r.openLater : r.acceptingOrders,
          distanceMeters: 1800,
          delivery: r.deliverable
            ? { zoneId: randomUUID(), deliveryFeePaisa: 9900, minimumOrderPaisa: 50000, deliveryTimeMinutes: 35 }
            : null,
        });
      }
      const owner = userId === r.ownerId || String(req.headers['x-user-roles']).split(',').includes('admin');
      return send(200, {
        id: rest[0],
        name: r.name,
        location: { lat: 24.93, lng: 67.1 },
        ...(owner ? { ownerId: r.ownerId } : {}),
      });
    }
    send(404);
  });
}

/** Puts `quantity` broasts at Rs 450 in the customer's cart. */
export function fillCart(customer: Headers, restaurantId: string, quantity = 2, itemId: string = randomUUID()) {
  carts.set(customer['X-User-Id'], {
    restaurantId,
    lines: [
      {
        id: randomUUID(),
        itemId,
        name: 'Chicken Broast',
        quantity,
        options: [],
        note: 'Extra garlic sauce',
        unitPricePaisa: 45000,
        lineTotalPaisa: 45000 * quantity,
      },
    ],
    subtotalPaisa: 45000 * quantity,
    problems: [],
  });
}

/** A customer with a priced cart and a saved address, and the restaurant's owner. */
export function scenario(
  over: { quantity?: number; acceptingOrders?: boolean; deliverable?: boolean; openLater?: boolean } = {},
) {
  const customer = newUser();
  const owner = newUser('customer,vendor');
  const restaurantId = randomUUID();
  const addressId = randomUUID();
  restaurants.set(restaurantId, {
    name: 'Karachi Broast',
    ownerId: owner['X-User-Id'],
    acceptingOrders: true,
    deliverable: true,
    ...over,
  });
  addresses.set(addressId, {
    ownerId: customer['X-User-Id'],
    area: 'Gulshan-e-Iqbal',
    city: 'Karachi',
    location: { lat: 24.92, lng: 67.09 },
  });
  fillCart(customer, restaurantId, over.quantity ?? 2);
  return { customer, owner, restaurantId, addressId };
}

export type Scenario = ReturnType<typeof scenario>;

/** A new customer, with an address and a cart, at the same restaurant as `s`. */
export function anotherCustomer(s: Scenario, quantity = 2): Scenario {
  const customer = newUser();
  const addressId = randomUUID();
  addresses.set(addressId, { ...addresses.get(s.addressId)!, ownerId: customer['X-User-Id'] });
  fillCart(customer, s.restaurantId, quantity);
  return { ...s, customer, addressId };
}

/**
 * The app wired to the stand-in services. `place` checks out and remembers
 * the order, and `close` deletes the orders placed and their events.
 */
export async function startApp() {
  const services = fakeServices();
  await new Promise<void>((resolve) => services.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(services.address() as AddressInfo).port}`;
  process.env.CART_SERVICE_URL = `${base}/cart`;
  process.env.USER_SERVICE_URL = `${base}/user`;
  process.env.RESTAURANT_SERVICE_URL = `${base}/restaurant`;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = setupApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const http = request(app.getHttpServer());
  const db = app.get<Database>(getDrizzleToken());
  const placed: string[] = [];
  const cleanups: (() => Promise<unknown>)[] = [];

  const checkout = (who: Headers, addressId: string, { key = randomUUID(), ...body }: CheckoutBody = {}) =>
    http
      .post('/')
      .set(who)
      .set('Idempotency-Key', key)
      .send({ addressId, paymentMethod: 'cod', note: 'No cutlery', ...body });

  return {
    app,
    http,
    db,
    placed,
    checkout,
    async place(s: Scenario, body: CheckoutBody = {}) {
      const res = await checkout(s.customer, s.addressId, body).expect(201);
      placed.push(res.body.id);
      return res.body as {
        id: string;
        totalPaisa: number;
        discountPaisa: number;
        tipPaisa: number;
        voucherCode: string | null;
      };
    },
    /** Runs `fn` on close, once the orders placed are gone (e.g. to delete what they refer to). */
    onClose(fn: () => Promise<unknown>) {
      cleanups.push(fn);
    },
    /** Has the restaurant accept the order and a rider deliver it at `at`. */
    async deliver(s: Scenario, orderId: string, riderId: string = randomUUID(), at = new Date()) {
      await http.post(`/${orderId}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(200);
      await app.get(OrdersService).applyRiderEvent(orderId, 'delivered', riderId, at);
    },
    async close() {
      if (placed.length) {
        await db.delete(outbox).where(inArray(outbox.key, placed));
        await db.delete(orders).where(inArray(orders.id, placed));
      }
      for (const fn of cleanups) await fn();
      await app.close();
      await new Promise<void>((resolve) => services.close(() => resolve()));
    },
  };
}

interface CheckoutBody {
  key?: string;
  voucherCode?: string;
  tipPaisa?: number;
  scheduledFor?: string;
}
