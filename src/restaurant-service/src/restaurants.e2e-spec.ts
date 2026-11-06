import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './app.module';
import type { Database } from './db/database';
import { deliveryZones, restaurants } from './db/schema';
import { setupApp } from './setup-app';

const createdUsers: string[] = [];

/** Identity headers as api-gateway would forward them, for a fresh user. */
function newUser(roles = 'customer') {
  const id = randomUUID();
  createdUsers.push(id);
  const phone = `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  return { 'X-User-Id': id, 'X-User-Phone': phone, 'X-User-Roles': roles };
}

const application = {
  name: 'Karachi Biryani House',
  description: 'Sindhi biryani and karahi since 1998',
  cuisines: ['biryani', 'pakistani'],
  phone: '+922134567890',
  address: { line1: 'Shop 4, Block 13-D', area: 'Gulshan-e-Iqbal', city: 'Karachi', province: 'sindh' },
  location: { lat: 24.9204, lng: 67.0932 },
};

const allDay = [{ opens: '00:00', closes: '24:00' }];
const openEveryDay = {
  weekly: { mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay, sun: allDay },
  special: [],
};

/** Gulshan-e-Iqbal and around, roughly. */
const gulshan = {
  type: 'Polygon',
  coordinates: [
    [
      [67.07, 24.9],
      [67.14, 24.9],
      [67.14, 24.95],
      [67.07, 24.95],
      [67.07, 24.9],
    ],
  ],
};

describe('restaurant-service (e2e)', () => {
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
    await db.delete(restaurants).where(inArray(restaurants.ownerId, createdUsers));
    await app.close();
  });

  async function apply(owner: Record<string, string>, body: object = application) {
    const res = await http.post('/').set(owner).send(body).expect(201);
    return res.body as { id: string } & Record<string, unknown>;
  }

  /** A zone straight in the database, for tests that don't exercise the zones API. */
  async function addZone(restaurantId: string) {
    await db.insert(deliveryZones).values({
      restaurantId,
      name: 'Gulshan',
      area: gulshan as never,
      deliveryFeePaisa: 9900,
      minimumOrderPaisa: 50000,
      deliveryTimeMinutes: 35,
    });
  }

  async function approved(owner: Record<string, string>) {
    const r = await apply(owner);
    await http.put(`/${r.id}/hours`).set(owner).send(openEveryDay).expect(200);
    await addZone(r.id);
    await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(200);
    return r;
  }

  describe('onboarding', () => {
    it('needs a signed-in user to apply', async () => {
      await http.post('/').send(application).expect(401);
    });

    it('creates a pending restaurant owned by the applicant', async () => {
      const owner = newUser();
      const r = await apply(owner);
      expect(r).toMatchObject({
        ...application,
        ownerId: owner['X-User-Id'],
        status: 'pending',
        statusReason: null,
        logoUrl: null,
        hours: { weekly: {}, special: [] },
        openNow: false,
        pausedUntil: null,
        acceptingOrders: false,
      });
    });

    it('lists my restaurants in any status, newest first', async () => {
      const owner = newUser();
      const first = await apply(owner);
      const second = await apply(owner, { ...application, name: 'Second Branch' });
      const res = await http.get('/mine').set(owner).expect(200);
      expect(res.body.map((r: { id: string }) => r.id)).toEqual([second.id, first.id]);
      await http.get('/mine').set(newUser()).expect(200, []);
    });

    it('hides pending restaurants from everyone but the owner and admins', async () => {
      const owner = newUser();
      const r = await apply(owner);
      await http.get(`/${r.id}`).expect(404);
      await http.get(`/${r.id}`).set(newUser()).expect(404);
      expect((await http.get(`/${r.id}`).set(owner).expect(200)).body.status).toBe('pending');
      expect((await http.get(`/${r.id}`).set(admin).expect(200)).body.status).toBe('pending');
    });
  });

  describe('management', () => {
    it('lets the owner change details, and nobody else', async () => {
      const owner = newUser();
      const r = await apply(owner);
      const res = await http
        .patch(`/${r.id}`)
        .set(owner)
        .send({ cuisines: ['biryani', 'desserts'], address: { ...application.address, area: 'Johar' } })
        .expect(200);
      expect(res.body).toMatchObject({ cuisines: ['biryani', 'desserts'], address: { area: 'Johar' } });

      await http.patch(`/${r.id}`).set(newUser()).send({ name: 'Mine now' }).expect(404);
      await http.patch(`/${r.id}`).set(admin).send({ name: 'Fixed by support' }).expect(200);
      await http.patch(`/${r.id}`).set(owner).send({ status: 'approved' }).expect(400);
    });

    it('sets opening hours and reports whether it is open', async () => {
      const owner = newUser();
      const r = await apply(owner);
      const res = await http.put(`/${r.id}/hours`).set(owner).send(openEveryDay).expect(200);
      expect(res.body).toMatchObject({ hours: openEveryDay, openNow: true, acceptingOrders: false });

      const closedToday = { weekly: {}, special: [] };
      expect((await http.put(`/${r.id}/hours`).set(owner).send(closedToday).expect(200)).body.openNow).toBe(false);

      const overlapping = { weekly: { mon: [{ opens: '11:00', closes: '15:00' }, { opens: '14:00', closes: '18:00' }] }, special: [] };
      await http.put(`/${r.id}/hours`).set(owner).send(overlapping).expect(400);
    });

    it('pauses and resumes orders', async () => {
      const owner = newUser();
      const r = await approved(owner);
      expect((await http.get(`/${r.id}`).expect(200)).body.acceptingOrders).toBe(true);

      const paused = await http.put(`/${r.id}/pause`).set(owner).send({ minutes: 30 }).expect(200);
      const until = Date.parse(paused.body.pausedUntil);
      expect(until - Date.now()).toBeGreaterThan(29 * 60_000);
      expect(paused.body.acceptingOrders).toBe(false);

      await http.put(`/${r.id}/pause`).set(owner).send({ minutes: 2 }).expect(400);
      await http.put(`/${r.id}/pause`).set(newUser()).send({ minutes: 30 }).expect(403);

      const resumed = await http.delete(`/${r.id}/pause`).set(owner).expect(200);
      expect(resumed.body).toMatchObject({ pausedUntil: null, acceptingOrders: true });
    });
  });

  describe('review', () => {
    it('is only for admins', async () => {
      await http.get('/admin').expect(401);
      await http.get('/admin').set(newUser()).expect(403);
      await http.get('/admin?status=closed').set(admin).expect(400);
    });

    it('lists pending applications oldest first', async () => {
      const owner = newUser();
      const a = await apply(owner);
      const b = await apply(owner);
      const res = await http.get('/admin?limit=50').set(admin).expect(200);
      const ids = res.body.items.map((r: { id: string }) => r.id);
      expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
      expect(res.body).toMatchObject({ page: 1, limit: 50 });
    });

    it('approves only with opening hours and a delivery zone', async () => {
      const owner = newUser();
      const r = await apply(owner);
      await http.post(`/${r.id}/status`).set(owner).send({ status: 'approved' }).expect(403);
      await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(409);

      await http.put(`/${r.id}/hours`).set(owner).send(openEveryDay).expect(200);
      await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(409);

      await addZone(r.id);
      const res = await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(200);
      expect(res.body).toMatchObject({ status: 'approved', acceptingOrders: true });

      const seen = await http.get(`/${r.id}`).expect(200);
      expect(seen.body).toMatchObject({ id: r.id, acceptingOrders: true });
      expect(seen.body).not.toHaveProperty('phone');
      expect(seen.body).not.toHaveProperty('ownerId');
    });

    it('rejects with a reason, and the owner can resubmit', async () => {
      const owner = newUser();
      const r = await apply(owner);
      await http.post(`/${r.id}/status`).set(admin).send({ status: 'rejected' }).expect(400);
      const rejected = await http
        .post(`/${r.id}/status`)
        .set(admin)
        .send({ status: 'rejected', reason: 'Menu photos do not match' })
        .expect(200);
      expect(rejected.body).toMatchObject({ status: 'rejected', statusReason: 'Menu photos do not match' });

      await http.post(`/${r.id}/status`).set(owner).send({ status: 'approved' }).expect(409);
      const resubmitted = await http.post(`/${r.id}/status`).set(owner).send({ status: 'pending' }).expect(200);
      expect(resubmitted.body).toMatchObject({ status: 'pending', statusReason: null });
    });

    it('suspends and reinstates an approved restaurant', async () => {
      const owner = newUser();
      const r = await approved(owner);
      await http.post(`/${r.id}/status`).set(owner).send({ status: 'suspended', reason: 'x' }).expect(403);
      await http.post(`/${r.id}/status`).set(admin).send({ status: 'suspended', reason: 'Food safety complaint' }).expect(200);
      await http.get(`/${r.id}`).expect(404);
      await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(200);
      await http.get(`/${r.id}`).expect(200);
    });
  });
});
