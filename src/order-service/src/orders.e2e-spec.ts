import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import type request from 'supertest';
import type { Database } from './db/database';
import { orders, outbox } from './db/schema';
import { DeliveryEventConsumer } from './delivery/delivery-event-consumer';
import { AcceptTimeouts } from './orders/accept-timeouts';
import { OrdersService } from './orders/orders.service';
import { carts, cleared, fillCart, type Headers, newUser, outage, scenario, startApp } from './testing/e2e';

describe('order-service (e2e)', () => {
  let t: Awaited<ReturnType<typeof startApp>>;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let db: Database;
  let placed: string[];
  let checkout: typeof t.checkout;
  let place: typeof t.place;
  const admin = newUser('customer,admin');

  beforeAll(async () => {
    t = await startApp();
    ({ app, http, db, placed, checkout, place } = t);
  });

  afterAll(() => t.close());

  afterEach(() => {
    outage.restaurant = false;
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
      lines: [
        {
          name: 'Chicken Broast',
          quantity: 2,
          note: 'Extra garlic sauce',
          unitPricePaisa: 45000,
          lineTotalPaisa: 90000,
        },
      ],
      subtotalPaisa: 90000,
      deliveryFeePaisa: 9900,
      discountPaisa: 0,
      voucherCode: null,
      tipPaisa: 0,
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

  it('adds a tip for the rider to the total', async () => {
    const s = scenario();
    for (const tipPaisa of [-1, 100_001, 10.5]) await checkout(s.customer, s.addressId, { tipPaisa }).expect(400);
    const order = await place(s, { tipPaisa: 5000 });
    expect(order).toMatchObject({ tipPaisa: 5000, totalPaisa: 104900 });
    const [event] = await db.select().from(outbox).where(eq(outbox.key, order.id));
    expect(event.payload).toMatchObject({ data: { totals: { tipPaisa: 5000, totalPaisa: 104900 } } });
  });

  it('returns the first order when a checkout is retried with the same key, even concurrently', async () => {
    const s = scenario();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      checkout(s.customer, s.addressId, { key }),
      checkout(s.customer, s.addressId, { key }),
    ]);
    placed.push(a.body.id);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(b.body.id).toBe(a.body.id);

    // The cart is empty by now, yet the retry still answers with the order.
    const later = await checkout(s.customer, s.addressId, { key }).expect(200);
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
    outage.restaurant = true;
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
    expect(events[1].payload).toMatchObject({
      data: { from: 'placed', to: 'accepted', by: 'restaurant', prepTimeMinutes: 40 },
    });
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
    const rejected = await http
      .post(`/${second.id}/status`)
      .set(b.owner)
      .send({ status: 'rejected', reason: 'Out of chicken' })
      .expect(200);
    expect(rejected.body).toMatchObject({
      status: 'rejected',
      timeline: [{}, { by: 'restaurant', reason: 'Out of chicken' }],
    });
  });

  it('lets only one of two racing changes through', async () => {
    const s = scenario();
    const order = await place(s);
    const [accept, cancel] = await Promise.all([
      http.post(`/${order.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }),
      http.post(`/${order.id}/status`).set(s.customer).send({ status: 'cancelled' }),
    ]);
    // The loser was judged against the winner's status: a cancel after the
    // accept is the admin's to make (403); an accept after the cancel is too late (409).
    if (accept.status === 200) expect(cancel.status).toBeOneOf([403, 409]);
    else expect([accept.status, cancel.status]).toEqual([409, 200]);
    const final = await http.get(`/${order.id}`).set(s.customer).expect(200);
    expect(final.body.timeline).toHaveLength(2);
  });

  it('rejects orders the restaurant never answered, once, and leaves the rest alone', async () => {
    const [late, fresh, answered] = [scenario(), scenario(), scenario()];
    const lateOrder = await place(late);
    const freshOrder = await place(fresh);
    const answeredOrder = await place(answered);
    await http
      .post(`/${answeredOrder.id}/status`)
      .set(answered.owner)
      .send({ status: 'accepted', prepTimeMinutes: 15 })
      .expect(200);
    const longAgo = new Date(Date.now() - 11 * 60_000);
    await db
      .update(orders)
      .set({ placedAt: longAgo })
      .where(inArray(orders.id, [lateOrder.id, answeredOrder.id]));

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
      expect.objectContaining({
        data: expect.objectContaining({
          from: 'placed',
          to: 'rejected',
          by: 'system',
          reason: 'Not accepted within 10 minutes',
        }),
      }),
    ]);
    expect((await http.get(`/${freshOrder.id}`).set(fresh.customer).expect(200)).body.status).toBe('placed');
    expect((await http.get(`/${answeredOrder.id}`).set(answered.customer).expect(200)).body.status).toBe('accepted');

    // Too late now for the restaurant.
    await http
      .post(`/${lateOrder.id}/status`)
      .set(late.owner)
      .send({ status: 'accepted', prepTimeMinutes: 15 })
      .expect(409);
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
      (await http.get(`/${id}`).set(s.customer).expect(200)).body.timeline.map(
        (t: { status: string; by: string }) => `${t.status}:${t.by}`,
      );

    it('moves the order when the rider picks up and delivers, once even if replayed', async () => {
      const s = scenario();
      const order = await place(s);
      await http.post(`/${order.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(200);

      await consume('delivery.picked_up', order.id); // the restaurant never marked it ready
      await consume('delivery.picked_up', order.id);
      await consume('delivery.delivered', order.id);
      await consume('delivery.delivered', order.id);

      expect(await timeline(s, order.id)).toEqual([
        'placed:customer',
        'accepted:restaurant',
        'picked_up:rider',
        'delivered:rider',
      ]);
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

  describe('reviews', () => {
    const rider = randomUUID();

    /** An order the rider delivered `daysAgo` days ago. */
    const delivered = async (s: ReturnType<typeof scenario>, daysAgo = 0) => {
      const order = await place(s);
      await http.post(`/${order.id}/status`).set(s.owner).send({ status: 'accepted', prepTimeMinutes: 15 }).expect(200);
      const at = new Date(Date.now() - daysAgo * 24 * 3600_000);
      await app.get(OrdersService).applyRiderEvent(order.id, 'delivered', rider, at);
      return order;
    };
    const review = (who: Headers, orderId: string, body: object) => http.post(`/${orderId}/review`).set(who).send(body);

    it('lets the customer rate a delivered order once, and publishes order.reviewed', async () => {
      const s = scenario();
      const order = await delivered(s);
      await http.get(`/${order.id}/review`).set(s.customer).expect(404);

      const res = await review(s.customer, order.id, {
        restaurantRating: 5,
        riderRating: 4,
        comment: '  Hot and on time  ',
      }).expect(201);
      expect(res.body).toEqual({
        orderId: order.id,
        restaurantId: s.restaurantId,
        riderId: rider,
        restaurantRating: 5,
        riderRating: 4,
        comment: 'Hot and on time',
        createdAt: expect.any(String),
      });
      // The restaurant's owner sees it too; strangers don't.
      await http.get(`/${order.id}/review`).set(s.owner).expect(200, res.body);
      await http.get(`/${order.id}/review`).set(newUser()).expect(404);

      const again = await review(s.customer, order.id, { restaurantRating: 1 }).expect(409);
      expect(again.body.message).toBe('This order has already been reviewed');

      const events = await db.select().from(outbox).where(eq(outbox.key, order.id));
      expect(events.find((e) => e.topic === 'order.reviewed')?.payload).toMatchObject({
        type: 'order.reviewed',
        source: 'order-service',
        data: {
          orderId: order.id,
          customerId: s.customer['X-User-Id'],
          restaurantId: s.restaurantId,
          riderId: rider,
          restaurantRating: 5,
          riderRating: 4,
          comment: 'Hot and on time',
          reviewedAt: res.body.createdAt,
        },
      });
    });

    it('only the customer, only once delivered, only within the window', async () => {
      const s = scenario();
      const order = await place(s);
      await review(s.customer, order.id, { restaurantRating: 4 }).expect(409); // still placed
      await review(s.owner, order.id, { restaurantRating: 5 }).expect(403);
      await review(newUser(), order.id, { restaurantRating: 5 }).expect(404);

      const old = scenario();
      const order8DaysAgo = await delivered(old, 8);
      const late = await review(old.customer, order8DaysAgo.id, { restaurantRating: 3 }).expect(409);
      expect(late.body.message).toBe('Orders can be reviewed within 7 days of delivery');
    });

    it('rejects ratings out of range, and a rider rating when no rider delivered', async () => {
      const s = scenario();
      const order = await delivered(s);
      await review(s.customer, order.id, { restaurantRating: 6 }).expect(400);
      await review(s.customer, order.id, { restaurantRating: 4, riderRating: 0 }).expect(400);
      await review(s.customer, order.id, { restaurantRating: 4, extra: true }).expect(400);

      const byAdmin = scenario();
      const handed = await place(byAdmin);
      for (const to of ['accepted', 'ready'] as const) {
        const body = to === 'accepted' ? { status: to, prepTimeMinutes: 15 } : { status: to };
        await http.post(`/${handed.id}/status`).set(byAdmin.owner).send(body).expect(200);
      }
      await http.post(`/${handed.id}/status`).set(admin).send({ status: 'picked_up' }).expect(200);
      await http.post(`/${handed.id}/status`).set(admin).send({ status: 'delivered' }).expect(200);
      const res = await review(byAdmin.customer, handed.id, { restaurantRating: 4, riderRating: 5 }).expect(400);
      expect(res.body.message).toBe('No rider delivered this order; leave out riderRating');
      const ok = await review(byAdmin.customer, handed.id, { restaurantRating: 4 }).expect(201);
      expect(ok.body).toMatchObject({ riderId: null, riderRating: null, comment: null });
    });
  });
});
