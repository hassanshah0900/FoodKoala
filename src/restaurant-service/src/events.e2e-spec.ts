import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { asc, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from './app.module';
import type { Database } from './db/database';
import { outbox, restaurants } from './db/schema';
import { setupApp } from './setup-app';

const owners: string[] = [];

function newUser(roles = 'customer') {
  const id = randomUUID();
  owners.push(id);
  return { 'X-User-Id': id, 'X-User-Phone': '+923001234567', 'X-User-Roles': roles };
}

const application = {
  name: 'Lahori Nihari',
  cuisines: ['nihari', 'pakistani'],
  phone: '+924234567890',
  address: { line1: '12 Food Street', area: 'Gulberg', city: 'Lahore', province: 'punjab' },
  location: { lat: 31.52, lng: 74.35 },
};

const allDay = [{ opens: '00:00', closes: '24:00' }];
const hours = {
  weekly: { mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay, sun: allDay },
  special: [],
};

const gulberg = {
  type: 'Polygon',
  coordinates: [
    [
      [74.3, 31.5],
      [74.4, 31.5],
      [74.4, 31.55],
      [74.3, 31.55],
      [74.3, 31.5],
    ],
  ],
};

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    http = request(app.getHttpServer());
    db = app.get<Database>(getDrizzleToken());
  });

  afterAll(async () => {
    const mine = await db.select({ id: restaurants.id }).from(restaurants).where(inArray(restaurants.ownerId, owners));
    if (mine.length)
      await db.delete(outbox).where(
        inArray(
          outbox.key,
          mine.map((r) => r.id),
        ),
      );
    await db.delete(restaurants).where(inArray(restaurants.ownerId, owners));
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
        name: 'Lahori Nihari',
        description: null,
        cuisines: ['nihari', 'pakistani'],
        status: 'pending',
        address: application.address,
        location: application.location,
        hours: { weekly: {}, special: [] },
        pausedUntil: null,
        zones: [],
      },
    });

    await http.put(`/${id}/hours`).set(owner).send(hours).expect(200);
    const zone = await http
      .post(`/${id}/zones`)
      .set(owner)
      .send({
        name: 'Gulberg',
        area: gulberg,
        deliveryFeePaisa: 7900,
        minimumOrderPaisa: 40000,
        deliveryTimeMinutes: 30,
      })
      .expect(201);
    await http.patch(`/${id}/zones/${zone.body.id}`).set(owner).send({ deliveryFeePaisa: 5900 }).expect(200);
    await http.post(`/${id}/status`).set(admin).send({ status: 'approved' }).expect(200);
    await http.patch(`/${id}`).set(owner).send({ name: 'Lahori Nihari House' }).expect(200);
    await http.put(`/${id}/pause`).set(owner).send({ minutes: 30 }).expect(200);
    await http.delete(`/${id}/zones/${zone.body.id}`).set(owner).expect(204);

    sent = await events(id);
    expect(sent.map((e) => e.data.revision)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sent[1].data.hours).toEqual(hours);
    expect(sent[2].data.zones).toEqual([
      { id: zone.body.id, area: gulberg, deliveryFeePaisa: 7900, minimumOrderPaisa: 40000, deliveryTimeMinutes: 30 },
    ]);
    expect(sent[3].data.zones[0].deliveryFeePaisa).toBe(5900);
    expect(sent[4].data.status).toBe('approved');
    expect(sent[5].data.name).toBe('Lahori Nihari House');
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
