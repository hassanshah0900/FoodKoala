import type { INestApplication } from '@nestjs/common';
import type request from 'supertest';
import type { Database } from './db/database';
import { deliveryZones } from './db/schema';
import {
  application,
  box,
  gulshan,
  openEveryDay,
  removeRestaurantsOf,
  startApp,
  userFactory,
  zone,
} from './testing/e2e';

const { ids: createdUsers, newUser } = userFactory();

describe('restaurant-service (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let db: Database;
  const admin = newUser('customer,admin');

  beforeAll(async () => {
    ({ app, http, db } = await startApp());
  });

  afterAll(async () => {
    await removeRestaurantsOf(db, createdUsers);
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

      const overlapping = {
        weekly: {
          mon: [
            { opens: '11:00', closes: '15:00' },
            { opens: '14:00', closes: '18:00' },
          ],
        },
        special: [],
      };
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
      await http
        .post(`/${r.id}/status`)
        .set(admin)
        .send({ status: 'suspended', reason: 'Food safety complaint' })
        .expect(200);
      await http.get(`/${r.id}`).expect(404);
      await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(200);
      await http.get(`/${r.id}`).expect(200);
    });
  });

  describe('delivery zones', () => {
    it('are drawn, listed, changed and deleted by the owner', async () => {
      const owner = newUser();
      const r = await apply(owner);
      const created = await http
        .post(`/${r.id}/zones`)
        .set(owner)
        .send({ ...zone(gulshan), name: 'Gulshan' })
        .expect(201);
      expect(created.body).toMatchObject({ name: 'Gulshan', area: gulshan, deliveryFeePaisa: 9900 });

      const zoneUrl = `/${r.id}/zones/${created.body.id}`;
      await http.patch(zoneUrl).set(owner).send({ deliveryFeePaisa: 4900 }).expect(200);
      const listed = await http.get(`/${r.id}/zones`).set(owner).expect(200);
      expect(listed.body).toEqual([expect.objectContaining({ id: created.body.id, deliveryFeePaisa: 4900 })]);

      await http.get(`/${r.id}/zones`).expect(401);
      await http.get(`/${r.id}/zones`).set(newUser()).expect(404);
      await http.delete(zoneUrl).set(owner).expect(204);
      await http.delete(zoneUrl).set(owner).expect(404);
    });

    it('rejects shapes that cross themselves, as PostGIS sees them', async () => {
      const owner = newUser();
      const r = await apply(owner);
      const bowtie = {
        type: 'Polygon',
        coordinates: [
          [
            [67, 24],
            [68, 25],
            [68, 24],
            [67, 25],
            [67, 24],
          ],
        ],
      };
      const res = await http.post(`/${r.id}/zones`).set(owner).send(zone(bowtie)).expect(400);
      expect(res.body.message).toMatch(/crosses itself/);

      const ok = await http.post(`/${r.id}/zones`).set(owner).send(zone(gulshan)).expect(201);
      await http.patch(`/${r.id}/zones/${ok.body.id}`).set(owner).send({ area: bowtie }).expect(400);
      await http
        .post(`/${r.id}/zones`)
        .set(owner)
        .send(zone({ ...gulshan, coordinates: [gulshan.coordinates[0].slice(0, 4)] }))
        .expect(400);
    });

    it('allows at most 10 per restaurant, even when created at once', async () => {
      const owner = newUser();
      const r = await apply(owner);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => http.post(`/${r.id}/zones`).set(owner).send(zone(gulshan))),
      );
      expect(results.filter((res) => res.status === 201)).toHaveLength(10);
      expect(results.filter((res) => res.status === 409)).toHaveLength(2);
    });
  });

  describe('browsing', () => {
    // Around Multan, away from the other tests' zones.
    const customer = { lat: 30.2, lng: 71.47 };
    const covering = box(71.4, 30.15, 71.55, 30.25);
    const elsewhere = box(71.6, 30.15, 71.7, 30.25);

    async function listed(owner: Record<string, string>, location: object, zones: object[], approve = true) {
      const r = await apply(owner, { ...application, location });
      await http.put(`/${r.id}/hours`).set(owner).send(openEveryDay).expect(200);
      for (const z of zones) await http.post(`/${r.id}/zones`).set(owner).send(z).expect(201);
      if (approve) await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(200);
      return r.id;
    }

    let far: string, near: string, outOfZone: string, pending: string;
    beforeAll(async () => {
      const owner = newUser();
      far = await listed(owner, { lat: 30.24, lng: 71.53 }, [zone(covering, 9900), zone(covering, 4900)]);
      near = await listed(owner, { lat: 30.201, lng: 71.471 }, [zone(covering)]);
      outOfZone = await listed(owner, { lat: 30.2, lng: 71.65 }, [zone(elsewhere)]);
      pending = await listed(owner, { lat: 30.2, lng: 71.47 }, [zone(covering)], false);
    });

    it('lists approved restaurants whose zones contain the point, nearest first', async () => {
      const res = await http
        .get('/')
        .query({ ...customer, limit: 50 })
        .expect(200);
      const ids: string[] = res.body.items.map((r: { id: string }) => r.id);
      expect(ids.indexOf(near)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(near)).toBeLessThan(ids.indexOf(far));
      expect(ids).not.toContain(outOfZone);
      expect(ids).not.toContain(pending);

      const farItem = res.body.items.find((r: { id: string }) => r.id === far);
      expect(farItem).toMatchObject({
        name: application.name,
        area: application.address.area,
        openNow: true,
        acceptingOrders: true,
        delivery: { deliveryFeePaisa: 4900, minimumOrderPaisa: 50000, deliveryTimeMinutes: 35 },
      });
      expect(farItem.distanceMeters).toBeGreaterThan(6000);
      expect(farItem.distanceMeters).toBeLessThan(8000);
    });

    it('pages through the results', async () => {
      const first = await http
        .get('/')
        .query({ ...customer, limit: 1 })
        .expect(200);
      expect(first.body).toMatchObject({ page: 1, limit: 1, hasMore: true });
      expect(first.body.items).toHaveLength(1);
      const second = await http
        .get('/')
        .query({ ...customer, limit: 1, page: 2 })
        .expect(200);
      expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    });

    it('needs a point inside Pakistan', async () => {
      await http.get('/').expect(400);
      await http.get('/').query({ lat: 51.5, lng: -0.12 }).expect(400);
    });

    it('quotes delivery to a point', async () => {
      const inside = await http.get(`/${far}/delivery-quote`).query(customer).expect(200);
      expect(inside.body).toMatchObject({
        deliverable: true,
        acceptingOrders: true,
        delivery: { deliveryFeePaisa: 4900 },
      });

      const outside = await http.get(`/${outOfZone}/delivery-quote`).query(customer).expect(200);
      expect(outside.body).toMatchObject({ deliverable: false, delivery: null });

      await http.get(`/${pending}/delivery-quote`).query(customer).expect(404);
      await http.get(`/${far}/delivery-quote`).expect(400);
    });
  });
});
