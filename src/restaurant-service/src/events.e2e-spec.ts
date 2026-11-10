import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type request from 'supertest';
import type { Database } from './db/database';
import { outbox } from './db/schema';
import { application, gulshan, openEveryDay, removeRestaurantsOf, startApp, userFactory } from './testing/e2e';

const { ids: owners, newUser } = userFactory();

interface Envelope {
  id: string;
  type: string;
  source: string;
  data: Record<string, any>;
}

describe('restaurant.updated (e2e)', () => {
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

  const events = async (restaurantId: string) => {
    const rows = await db.select().from(outbox).where(eq(outbox.key, restaurantId)).orderBy(asc(outbox.id));
    for (const r of rows) {
      expect(r.topic).toBe('restaurant.updated');
      expect((r.payload as Envelope).id).toBe(r.eventId);
    }
    return rows.map((r) => r.payload as Envelope);
  };

  it('publishes the whole restaurant after every change, with a growing revision', async () => {
    const owner = newUser();
    const created = await http.post('/').set(owner).send(application).expect(201);
    const id = created.body.id as string;

    let sent = await events(id);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'restaurant.updated',
      source: 'restaurant-service',
      data: {
        restaurantId: id,
        revision: 1,
        name: application.name,
        description: application.description,
        cuisines: application.cuisines,
        status: 'pending',
        address: application.address,
        location: application.location,
        hours: { weekly: {}, special: [] },
        pausedUntil: null,
        rating: { average: null, count: 0 },
        zones: [],
      },
    });

    await http.put(`/${id}/hours`).set(owner).send(openEveryDay).expect(200);
    const zone = await http
      .post(`/${id}/zones`)
      .set(owner)
      .send({
        name: 'Gulshan',
        area: gulshan,
        deliveryFeePaisa: 7900,
        minimumOrderPaisa: 40000,
        deliveryTimeMinutes: 30,
      })
      .expect(201);
    await http.patch(`/${id}/zones/${zone.body.id}`).set(owner).send({ deliveryFeePaisa: 5900 }).expect(200);
    await http.post(`/${id}/status`).set(admin).send({ status: 'approved' }).expect(200);
    await http.patch(`/${id}`).set(owner).send({ name: 'Biryani House Gulshan' }).expect(200);
    await http.put(`/${id}/pause`).set(owner).send({ minutes: 30 }).expect(200);
    await http.delete(`/${id}/zones/${zone.body.id}`).set(owner).expect(204);

    sent = await events(id);
    expect(sent.map((e) => e.data.revision)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sent[1].data.hours).toEqual(openEveryDay);
    expect(sent[2].data.zones).toEqual([
      { id: zone.body.id, area: gulshan, deliveryFeePaisa: 7900, minimumOrderPaisa: 40000, deliveryTimeMinutes: 30 },
    ]);
    expect(sent[3].data.zones[0].deliveryFeePaisa).toBe(5900);
    expect(sent[4].data.status).toBe('approved');
    expect(sent[5].data.name).toBe('Biryani House Gulshan');
    expect(Date.parse(sent[6].data.pausedUntil)).toBeGreaterThan(Date.now());
    expect(sent[7].data.zones).toEqual([]);
    expect(new Set(sent.map((e) => e.id)).size).toBe(8);
  });

  it('publishes nothing when a change is refused', async () => {
    const owner = newUser();
    const created = await http.post('/').set(owner).send(application).expect(201);
    const id = created.body.id as string;

    await http.patch(`/${id}`).set(newUser()).send({ name: 'Hijacked' }).expect(404);
    // Approval needs hours and a zone first.
    await http.post(`/${id}/status`).set(admin).send({ status: 'approved' }).expect(409);
    await http.delete(`/${id}/zones/${randomUUID()}`).set(owner).expect(404);

    expect(await events(id)).toHaveLength(1);
  });
});
