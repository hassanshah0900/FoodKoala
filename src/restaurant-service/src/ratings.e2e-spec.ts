import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type request from 'supertest';
import type { Database } from './db/database';
import { outbox } from './db/schema';
import { OrderReviewedConsumer } from './ratings/order-reviewed-consumer';
import { application, approvedRestaurant, removeRestaurantsOf, startApp, userFactory } from './testing/e2e';

const { ids: owners, newUser } = userFactory();

/** An order.reviewed message as order-service publishes it. */
function reviewed(restaurantId: string, rating: number, comment: string | null = null, orderId = randomUUID()) {
  const data = {
    orderId,
    customerId: randomUUID(),
    restaurantId,
    riderId: randomUUID(),
    restaurantRating: rating,
    riderRating: 5,
    comment,
    reviewedAt: new Date().toISOString(),
  };
  const value = {
    id: randomUUID(),
    type: 'order.reviewed',
    version: 1,
    occurredAt: data.reviewedAt,
    source: 'order-service',
    data,
  };
  return { value: Buffer.from(JSON.stringify(value)), offset: '0' };
}

describe('ratings (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let db: Database;
  const admin = newUser('customer,admin');

  beforeAll(async () => {
    ({ app, http, db } = await startApp());
  });

  afterAll(async () => {
    await removeRestaurantsOf(db, owners);
    await app.close();
  });

  const consume = (message: ReturnType<typeof reviewed>) =>
    app.get(OrderReviewedConsumer).handle('order.reviewed', 0, message);

  it('averages the ratings of order.reviewed, once per order, and shows the reviews', async () => {
    const r = await approvedRestaurant(http, newUser(), admin);
    await http
      .get(`/${r.id}`)
      .expect(200)
      .expect((res) => expect(res.body.rating).toEqual({ average: null, count: 0 }));

    const first = reviewed(r.id, 5, 'Best biryani in Gulshan');
    await consume(first);
    await consume(first); // redelivered
    await consume(reviewed(r.id, 4));
    await consume(reviewed(r.id, 4, 'Bit too spicy'));

    const { body } = await http.get(`/${r.id}`).expect(200);
    expect(body.rating).toEqual({ average: 4.3, count: 3 });
    const listed = await http.get('/').query({ lat: application.location.lat, lng: application.location.lng });
    expect(listed.body.items.find((x: { id: string }) => x.id === r.id).rating).toEqual({ average: 4.3, count: 3 });

    const reviews = await http.get(`/${r.id}/reviews`).query({ limit: 2 }).expect(200);
    expect(reviews.body).toEqual({
      items: [
        { rating: 4, comment: 'Bit too spicy', createdAt: expect.any(String) },
        { rating: 4, comment: null, createdAt: expect.any(String) },
      ],
      page: 1,
      limit: 2,
      hasMore: true,
    });

    // Search hears about the new rating through restaurant.updated.
    const events = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.key, r.id), eq(outbox.topic, 'restaurant.updated')));
    const latest = events.at(-1)?.payload as { data: { rating: unknown } };
    expect(latest.data.rating).toEqual({ average: 4.3, count: 3 });
  });

  it('ignores reviews of unknown restaurants and malformed events', async () => {
    await consume(reviewed(randomUUID(), 5));
    await app.get(OrderReviewedConsumer).handle('order.reviewed', 0, { value: Buffer.from('{}'), offset: '1' });
    await app.get(OrderReviewedConsumer).handle('order.reviewed', 0, { value: null, offset: '2' });
  });

  it('only lists reviews of approved restaurants', async () => {
    const { body: pending } = await http.post('/').set(newUser()).send(application).expect(201);
    await http.get(`/${pending.id}/reviews`).expect(404);
    await http.get(`/${randomUUID()}/reviews`).expect(404);
    await http.get('/not-a-uuid/reviews').expect(400);
  });
});
