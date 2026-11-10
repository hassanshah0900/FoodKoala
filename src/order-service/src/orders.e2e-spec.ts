import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from './app.module';
import type { Cart } from './clients/clients';
import type { Database } from './db/database';
import { orders, outbox } from './db/schema';
import { DeliveryEventConsumer } from './delivery/delivery-event-consumer';
import { AcceptTimeouts } from './orders/accept-timeouts';
import { setupApp } from './setup-app';

type Headers = Record<'X-User-Id' | 'X-User-Phone' | 'X-User-Roles', string>;

function newUser(roles = 'customer'): Headers {
  const phone = `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  return { 'X-User-Id': randomUUID(), 'X-User-Phone': phone, 'X-User-Roles': roles };
}

/** State of the stand-in cart, user and restaurant services. */
const carts = new Map<string, Cart>();
const addresses = new Map<string, { ownerId: string; area: string; city: string; location: { lat: number; lng: number } }>();
const restaurants = new Map<string, { name: string; ownerId: string; acceptingOrders: boolean; deliverable: boolean }>();
let restaurantDown = false;
const cleared: string[] = [];

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
      return send(200, carts.get(userId) ?? { restaurantId: null, lines: [], subtotalPaisa: 0, problems: [], updatedAt: null });
    }
    if (service === 'user') {
      const address = addresses.get(rest[2]);
      if (!userId || !address || address.ownerId !== userId) return send(404, { statusCode: 404 });
      return send(200, { id: rest[2], label: 'home', labelText: null, line1: 'House 7', landmark: null, instructions: null, isDefault: true, ...address });
    }
    if (service === 'restaurant') {
      if (restaurantDown) return send(503);
      const r = restaurants.get(rest[0]);
      if (!r) return send(404, { statusCode: 404 });
      if (rest[1] === 'delivery-quote') {
        return send(200, {
          deliverable: r.deliverable,
          acceptingOrders: r.acceptingOrders,
          distanceMeters: 1800,
          delivery: r.deliverable ? { zoneId: randomUUID(), deliveryFeePaisa: 9900, minimumOrderPaisa: 50000, deliveryTimeMinutes: 35 } : null,
        });
      }
      const owner = userId === r.ownerId || String(req.headers['x-user-roles']).split(',').includes('admin');
      return send(200, { id: rest[0], name: r.name, location: { lat: 24.93, lng: 67.1 }, ...(owner ? { ownerId: r.ownerId } : {}) });
    }
    send(404);
  });
}

/** Puts `quantity` broasts at Rs 450 in the customer's cart. */
function fillCart(customer: Headers, restaurantId: string, quantity = 2) {
  carts.set(customer['X-User-Id'], {
    restaurantId,
    lines: [
      {
        id: randomUUID(),
        itemId: randomUUID(),
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
function scenario(over: { quantity?: number; acceptingOrders?: boolean; deliverable?: boolean } = {}) {
  const customer = newUser();
  const owner = newUser('customer,vendor');
  const restaurantId = randomUUID();
  const addressId = randomUUID();
  restaurants.set(restaurantId, { name: 'Karachi Broast', ownerId: owner['X-User-Id'], acceptingOrders: true, deliverable: true, ...over });
  addresses.set(addressId, { ownerId: customer['X-User-Id'], area: 'Gulshan-e-Iqbal', city: 'Karachi', location: { lat: 24.92, lng: 67.09 } });
  fillCart(customer, restaurantId, over.quantity ?? 2);
  return { customer, owner, restaurantId, addressId };
}

describe('order-service (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let db: Database;
  let services: Server;
  const admin = newUser('customer,admin');
  const placed: string[] = [];

  const checkout = (who: Headers, addressId: string, key = randomUUID()) =>
    http.post('/').set(who).set('Idempotency-Key', key).send({ addressId, paymentMethod: 'cod', note: 'No cutlery' });

  const place = async (s: ReturnType<typeof scenario>) => {
    const res = await checkout(s.customer, s.addressId).expect(201);
    placed.push(res.body.id);
    return res.body as { id: string };
  };

  beforeAll(async () => {
    services = fakeServices();
    await new Promise<void>((resolve) => services.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(services.address() as AddressInfo).port}`;
    process.env.CART_SERVICE_URL = `${base}/cart`;
    process.env.USER_SERVICE_URL = `${base}/user`;
    process.env.RESTAURANT_SERVICE_URL = `${base}/restaurant`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    http = request(app.getHttpServer());
    db = app.get<Database>(getDrizzleToken());
  });

  afterAll(async () => {
    if (placed.length) {
      await db.delete(outbox).where(inArray(outbox.key, placed));
      await db.delete(orders).where(inArray(orders.id, placed));
    }
    await app.close();
    await new Promise<void>((resolve) => services.close(() => resolve()));
  });

  afterEach(() => {
    restaurantDown = false;
  });

  it('needs a signed-in user and an Idempotency-Key', async () => {
    const s = scenario();
    await http.post('/').send({ addressId: s.addressId, paymentMethod: 'cod' }).expect(401);
    const res = await http.post('/').set(s.customer).send({ addressId: s.addressId, paymentMethod: 'cod' }).expect(400);
    expect(res.body.message).toBe('Send an Idempotency-Key header');
  });

  it('places an order priced from the cart and the zone, empties the cart and writes the event', async () => {
    const s = scenario();
    const res = await checkout(s.customer, s.addressId).expect(201);
    placed.push(res.body.id);
    expect(res.body).toMatchObject({
      status: 'placed',
      customerId: s.customer['X-User-Id'],
      customerPhone: s.customer['X-User-Phone'],
      restaurant: { id: s.restaurantId, name: 'Karachi Broast' },
      lines: [{ name: 'Chicken Broast', quantity: 2, note: 'Extra garlic sauce', unitPricePaisa: 45000, lineTotalPaisa: 90000 }],
      subtotalPaisa: 90000,
      deliveryFeePaisa: 9900,
      totalPaisa: 99900,
      paymentMethod: 'cod',
      note: 'No cutlery',
      deliveryAddress: { area: 'Gulshan-e-Iqbal', city: 'Karachi', location: { lat: 24.92, lng: 67.09 } },
      prepTimeMinutes: null,
      timeline: [{ status: 'placed', by: 'customer', reason: null }],
    });
    const minutes = (Date.parse(res.body.estimatedDeliveryAt) - Date.parse(res.body.placedAt)) / 60_000;
    expect(minutes).toBe(35);
    expect(cleared).toContain(s.customer['X-User-Id']);

    const events = await db.select().from(outbox).where(eq(outbox.key, res.body.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ topic: 'order.placed', publishedAt: null });
    expect(events[0].payload).toMatchObject({
      type: 'order.placed',
      data: { orderId: res.body.id, totals: { totalPaisa: 99900 }, restaurantLocation: { lat: 24.93, lng: 67.1 } },
    });
    expect(res.body.restaurant.location).toEqual({ lat: 24.93, lng: 67.1 });
  });

  it('returns the first order when a checkout is retried with the same key, even concurrently', async () => {
    const s = scenario();
    const key = randomUUID();
    const [a, b] = await Promise.all([checkout(s.customer, s.addressId, key), checkout(s.customer, s.addressId, key)]);
    placed.push(a.body.id);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(b.body.id).toBe(a.body.id);

    // The cart is empty by now, yet the retry still answers with the order.
    const later = await checkout(s.customer, s.addressId, key).expect(200);
    expect(later.body.id).toBe(a.body.id);
    expect(await db.select().from(orders).where(eq(orders.customerId, s.customer['X-User-Id']))).toHaveLength(1);
  });

  it('refuses what cannot be ordered', async () => {
    const empty = newUser();
    await checkout(empty, randomUUID()).expect(409);

    const small = scenario({ quantity: 1 });
    const res = await checkout(small.customer, small.addressId).expect(422);
    expect(res.body.message).toEqual(['The minimum order here is Rs 500; add Rs 50 more']);

    const closed = scenario({ acceptingOrders: false });
    await checkout(closed.customer, closed.addressId).expect(409);

    const far = scenario({ deliverable: false });
    const outside = await checkout(far.customer, far.addressId).expect(422);
    expect(outside.body.message).toEqual(["Karachi Broast doesn't deliver to Gulshan-e-Iqbal, Karachi"]);

    const other = scenario();
    const notMine = await checkout(other.customer, small.addressId).expect(422);
    expect(notMine.body.message).toEqual(['Choose one of your saved addresses']);

    const card = await http
      .post('/')
      .set(other.customer)
      .set('Idempotency-Key', randomUUID())
      .send({ addressId: other.addressId, paymentMethod: 'card' })
      .expect(422);
    expect(card.body.message).toEqual(['Only cash on delivery is available for now']);

    const soldOut = scenario();
    carts.get(soldOut.customer['X-User-Id'])!.problems = [{ lineId: null, message: 'Chicken Broast is sold out' }];
    await checkout(soldOut.customer, soldOut.addressId).expect(422);

    expect(carts.has(other.customer['X-User-Id'])).toBe(true);
  });

  it('fails closed when restaurant-service is down', async () => {
    const s = scenario();
    restaurantDown = true;
    await checkout(s.customer, s.addressId).expect(503);
    expect(carts.has(s.customer['X-User-Id'])).toBe(true);
  });

  it('shows an order to its customer, its restaurant and admins only', async () => {
    const s = scenario();
    const order = await place(s);
    await http.get(`/${order.id}`).set(s.customer).expect(200);
    await http.get(`/${order.id}`).set(s.owner).expect(200);
    await http.get(`/${order.id}`).set(admin).expect(200);
    await http.get(`/${order.id}`).set(newUser()).expect(404);
    await http.get(`/${randomUUID()}`).set(admin).expect(404);
    await http.get('/not-a-uuid').set(admin).expect(400);

    const mine = await http.get('/').set(s.customer).expect(200);
    expect(mine.body).toMatchObject({ items: [{ id: order.id }], page: 1, hasMore: false });
  });

  it('lists a restaurant’s orders by status for its owner', async () => {
    const s = scenario();
    const first = await place(s);
    fillCart(s.customer, s.restaurantId);
    const second = await place(s);
    await http.post(`/${first.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 20 }).expect(200);

    const all = await http.get(`/restaurants/${s.restaurantId}/orders`).set(s.owner).expect(200);
    expect(all.body.items.map((o: { id: string }) => o.id)).toEqual([second.id, first.id]);
    const waiting = await http.get(`/restaurants/${s.restaurantId}/orders?status=placed`).set(s.owner).expect(200);
    expect(waiting.body.items.map((o: { id: string }) => o.id)).toEqual([second.id]);

    await http.get(`/restaurants/${s.restaurantId}/orders`).set(s.customer).expect(403);
    await http.get(`/restaurants/${randomUUID()}/orders`).set(s.owner).expect(404);
    await http.get(`/restaurants/${s.restaurantId}/orders?status=cooking`).set(s.owner).expect(400);
    await http.get(`/restaurants/${s.restaurantId}/orders`).set(admin).expect(200);
  });

  it('walks an order from placed to delivered and keeps the timeline', async () => {
    const s = scenario();
    const order = await place(s);
    const status = (who: Headers, body: object) => http.post(`/${order.id}/status`).set(who).send(body);

    await status(s.customer, { status: 'accepted', prepTimeMinutes: 20 }).expect(403);
    await status(s.owner, { status: 'accepted' }).expect(400);
    const accepted = await status(s.owner, { status: 'accepted', prepTimeMinutes: 40 }).expect(200);
    expect(accepted.body).toMatchObject({ status: 'accepted', prepTimeMinutes: 40 });
    const minutes = (Date.parse(accepted.body.estimatedDeliveryAt) - Date.parse(accepted.body.placedAt)) / 60_000;
    expect(minutes).toBeGreaterThanOrEqual(55); // 40 in the kitchen + 15 on the road, past the 35 promised

    await status(s.customer, { status: 'cancelled' }).expect(403);
    await status(s.owner, { status: 'delivered' }).expect(409);
    await status(s.owner, { status: 'ready' }).expect(200);
    await status(s.owner, { status: 'picked_up' }).expect(403);
    await status(admin, { status: 'picked_up' }).expect(200);
    const delivered = await status(admin, { status: 'delivered' }).expect(200);
    expect(delivered.body.timeline.map((t: { status: string; by: string }) => `${t.status}:${t.by}`)).toEqual([
      'placed:customer',
      'accepted:restaurant',
      'ready:restaurant',
      'picked_up:admin',
      'delivered:admin',
    ]);
    const done = await status(admin, { status: 'cancelled', reason: 'Too late' }).expect(409);
    expect(done.body.message).toBe('The order is already delivered');

    const events = await db.select().from(outbox).where(eq(outbox.key, order.id)).orderBy(outbox.id);
    expect(events.map((e) => e.topic)).toEqual(['order.placed', ...Array(4).fill('order.status_changed')]);
    expect(events[1].payload).toMatchObject({ data: { from: 'placed', to: 'accepted', by: 'restaurant', prepTimeMinutes: 40 } });
  });

  it('lets the customer cancel before acceptance and the restaurant reject with a reason', async () => {
    const a = scenario();
    const first = await place(a);
    const cancelled = await http.post(`/${first.id}/status`).set(a.customer).send({ status: 'cancelled' }).expect(200);
    expect(cancelled.body.timeline.at(-1)).toMatchObject({ status: 'cancelled', by: 'customer', reason: null });

    const b = scenario();
    const second = await place(b);
    await http.post(`/${second.id}/status`).set(newUser()).send({ status: 'cancelled' }).expect(404);
    await http.post(`/${second.id}/status`).set(b.owner).send({ status: 'rejected' }).expect(400);
    const rejected = await http.post(`/${second.id}/status`).set(b.owner).send({ status: 'rejected', reason: 'Out of chicken' }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'rejected', timeline: [{}, { by: 'restaurant', reason: 'Out of chicken' }] });
  });

  it('lets only one of two racing changes through', async () => {
    const s = scenario();
    const order = await place(s);
    const [accept, cancel] = await Promise.all([
      http.post(`/${order.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }),
      http.post(`/${order.id}/status`).set(s.customer).send({ status: 'cancelled' }),
    ]);
    expect([accept.status, cancel.status].sort()).toEqual([200, 409]);
    const final = await http.get(`/${order.id}`).set(s.customer).expect(200);
    expect(final.body.timeline).toHaveLength(2);
  });

  it('rejects orders the restaurant never answered, once, and leaves the rest alone', async () => {
    const [late, fresh, answered] = [scenario(), scenario(), scenario()];
    const lateOrder = await place(late);
    const freshOrder = await place(fresh);
    const answeredOrder = await place(answered);
    await http.post(`/${answeredOrder.id}/status`).set(answered.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(200);
    const longAgo = new Date(Date.now() - 11 * 60_000);
    await db.update(orders).set({ placedAt: longAgo }).where(inArray(orders.id, [lateOrder.id, answeredOrder.id]));

    // Two replicas at once: the order is still rejected only once.
    const timeouts = app.get(AcceptTimeouts);
    await Promise.all([timeouts.runOnce(), timeouts.runOnce()]);

    const rejected = (await http.get(`/${lateOrder.id}`).set(late.customer).expect(200)).body;
    expect(rejected.status).toBe('rejected');
    expect(rejected.timeline).toEqual([
      expect.objectContaining({ status: 'placed', by: 'customer' }),
      expect.objectContaining({ status: 'rejected', by: 'system', reason: 'Not accepted within 10 minutes' }),
    ]);
    const events = await db.select().from(outbox).where(eq(outbox.key, lateOrder.id)).orderBy(outbox.id);
    expect(events.map((e) => e.payload)).toEqual([
      expect.objectContaining({ type: 'order.placed' }),
      expect.objectContaining({ data: expect.objectContaining({ from: 'placed', to: 'rejected', by: 'system', reason: 'Not accepted within 10 minutes' }) }),
    ]);
    expect((await http.get(`/${freshOrder.id}`).set(fresh.customer).expect(200)).body.status).toBe('placed');
    expect((await http.get(`/${answeredOrder.id}`).set(answered.customer).expect(200)).body.status).toBe('accepted');

    // Too late now for the restaurant.
    await http.post(`/${lateOrder.id}/status`).set(late.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(409);
  });

  describe('rider events from delivery-service', () => {
    const rider = randomUUID();
    const event = (type: 'delivery.picked_up' | 'delivery.delivered', orderId: string) => ({
      value: Buffer.from(
        JSON.stringify({
          id: randomUUID(),
          type,
          version: 1,
          occurredAt: new Date().toISOString(),
          source: 'delivery-service',
          data: { deliveryId: randomUUID(), orderId, riderId: rider, at: new Date().toISOString() },
        }),
      ),
      offset: '0',
    });
    const consume = (type: 'delivery.picked_up' | 'delivery.delivered', orderId: string) =>
      app.get(DeliveryEventConsumer).handle(type, 0, event(type, orderId));
    const timeline = async (s: ReturnType<typeof scenario>, id: string) =>
      (await http.get(`/${id}`).set(s.customer).expect(200)).body.timeline.map((t: { status: string; by: string }) => `${t.status}:${t.by}`);

    it('moves the order when the rider picks up and delivers, once even if replayed', async () => {
      const s = scenario();
      const order = await place(s);
      await http.post(`/${order.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(200);

      await consume('delivery.picked_up', order.id); // the restaurant never marked it ready
      await consume('delivery.picked_up', order.id);
      await consume('delivery.delivered', order.id);
      await consume('delivery.delivered', order.id);

      expect(await timeline(s, order.id)).toEqual(['placed:customer', 'accepted:restaurant', 'picked_up:rider', 'delivered:rider']);
      const events = await db.select().from(outbox).where(eq(outbox.key, order.id)).orderBy(outbox.id);
      expect(events.at(-1)!.payload).toMatchObject({ data: { to: 'delivered', by: 'rider' } });
      const [history] = await db.select().from(orders).where(eq(orders.id, order.id));
      expect(history.status).toBe('delivered');
    });

    it('records the pickup too when the drop-off arrives first', async () => {
      const s = scenario();
      const order = await place(s);
      await http.post(`/${order.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(200);
      await http.post(`/${order.id}/status`).set(s.owner).send({ status: 'ready' }).expect(200);

      await consume('delivery.delivered', order.id);
      await consume('delivery.picked_up', order.id); // late, nothing left to do
      expect(await timeline(s, order.id)).toEqual([
        'placed:customer',
        'accepted:restaurant',
        'ready:restaurant',
        'picked_up:rider',
        'delivered:rider',
      ]);
    });

    it('ignores rider events for cancelled, not yet accepted or unknown orders, and malformed ones', async () => {
      const s = scenario();
      const order = await place(s);
      await consume('delivery.picked_up', order.id); // still only placed
      await http.post(`/${order.id}/status`).set(s.customer).send({ status: 'cancelled' }).expect(200);
      await consume('delivery.delivered', order.id);
      expect(await timeline(s, order.id)).toEqual(['placed:customer', 'cancelled:customer']);

      await consume('delivery.delivered', randomUUID());
      await app.get(DeliveryEventConsumer).handle('delivery.delivered', 0, { value: Buffer.from('{}'), offset: '1' });
    });

    it('still keeps riders out of the HTTP API', async () => {
      const s = scenario();
      const order = await place(s);
      await http.post(`/${order.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(200);
      const res = await http.post(`/${order.id}/status`).set(admin).send({ status: 'picked_up' }).expect(403);
      expect(res.body.message).toBe('Only the rider can mark picked up this order');
    });
  });
});
