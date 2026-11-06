import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './app.module';
import type { Database } from './db/database';
import { profiles } from './db/schema';
import { setupApp } from './setup-app';

const createdUsers: string[] = [];

/** Identity headers as api-gateway would forward them, for a fresh user. */
function newUser(phone = `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`) {
  const id = randomUUID();
  createdUsers.push(id);
  return { 'X-User-Id': id, 'X-User-Phone': phone, 'X-User-Roles': 'customer' };
}

const home = {
  label: 'home',
  line1: 'House 12, Street 7',
  area: 'F-7/2',
  city: 'Islamabad',
  landmark: 'Near Jinnah Super market',
  instructions: 'Ring the bell twice',
  location: { lat: 33.7215, lng: 73.0433 },
};
const work = { label: 'work', line1: 'Office 3, Blue Area', area: 'Blue Area', city: 'Islamabad', location: { lat: 33.7104, lng: 73.0597 } };

describe('user-service (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    if (createdUsers.length) {
      await app.get<Database>(getDrizzleToken()).delete(profiles).where(inArray(profiles.id, createdUsers));
    }
    await app.close();
  });

  it('rejects requests the gateway did not authenticate', async () => {
    await http.get('/me').expect(401);
    await http.get('/me/addresses').expect(401);
  });

  describe('profile', () => {
    it('is created on first access from the identity headers', async () => {
      const me = newUser('+923001112233');
      const res = await http.get('/me').set(me).expect(200);
      expect(res.body).toMatchObject({
        id: me['X-User-Id'],
        phone: '+923001112233',
        name: null,
        email: null,
        preferredLanguage: 'en',
      });
    });

    it('updates name, email and language, and clears with null', async () => {
      const me = newUser();
      const res = await http
        .patch('/me')
        .set(me)
        .send({ name: '  Ayesha Khan ', email: 'Ayesha@Example.PK', preferredLanguage: 'ur' })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Ayesha Khan', email: 'ayesha@example.pk', preferredLanguage: 'ur' });

      const cleared = await http.patch('/me').set(me).send({ email: null }).expect(200);
      expect(cleared.body).toMatchObject({ name: 'Ayesha Khan', email: null });
    });

    it('rejects invalid or empty updates', async () => {
      const me = newUser();
      await http.patch('/me').set(me).send({}).expect(400);
      await http.patch('/me').set(me).send({ email: 'not-an-email' }).expect(400);
      await http.patch('/me').set(me).send({ preferredLanguage: 'fr' }).expect(400);
      await http.patch('/me').set(me).send({ phone: '+923009999999' }).expect(400);
    });

    it('follows phone number changes from auth', async () => {
      const me = newUser('+923001110000');
      await http.get('/me').set(me).expect(200);
      const res = await http.get('/me').set({ ...me, 'X-User-Phone': '+923001119999' }).expect(200);
      expect(res.body.phone).toBe('+923001119999');
    });
  });

  describe('addresses', () => {
    it('makes the first address the default and lists the default first', async () => {
      const me = newUser();
      const first = await http.post('/me/addresses').set(me).send(home).expect(201);
      expect(first.body).toMatchObject({ ...home, labelText: null, isDefault: true });
      expect(first.body).not.toHaveProperty('userId');

      const second = await http.post('/me/addresses').set(me).send(work).expect(201);
      expect(second.body.isDefault).toBe(false);

      const list = await http.get('/me/addresses').set(me).expect(200);
      expect(list.body.map((a: { id: string }) => a.id)).toEqual([first.body.id, second.body.id]);
    });

    it('switches the default on create and on update, keeping exactly one', async () => {
      const me = newUser();
      const a = (await http.post('/me/addresses').set(me).send(home)).body;
      const b = (await http.post('/me/addresses').set(me).send({ ...work, isDefault: true })).body;
      expect(b.isDefault).toBe(true);

      await http.patch(`/me/addresses/${a.id}`).set(me).send({ isDefault: true }).expect(200);
      const list = (await http.get('/me/addresses').set(me)).body as { id: string; isDefault: boolean }[];
      expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([a.id]);

      await http.patch(`/me/addresses/${a.id}`).set(me).send({ isDefault: false }).expect(400);
    });

    it('updates fields and clears optional ones with null', async () => {
      const me = newUser();
      const a = (await http.post('/me/addresses').set(me).send(home)).body;
      const res = await http
        .patch(`/me/addresses/${a.id}`)
        .set(me)
        .send({ landmark: null, location: { lat: 33.72, lng: 73.04 }, label: 'other', labelText: "Ammi's house" })
        .expect(200);
      expect(res.body).toMatchObject({
        landmark: null,
        instructions: home.instructions,
        location: { lat: 33.72, lng: 73.04 },
        label: 'other',
        labelText: "Ammi's house",
        isDefault: true,
      });
    });

    it('promotes the newest remaining address when the default is deleted', async () => {
      const me = newUser();
      const a = (await http.post('/me/addresses').set(me).send(home)).body;
      const b = (await http.post('/me/addresses').set(me).send(work)).body;
      const c = (await http.post('/me/addresses').set(me).send({ ...work, line1: 'Office 9' })).body;

      await http.delete(`/me/addresses/${a.id}`).set(me).expect(204);
      const list = (await http.get('/me/addresses').set(me)).body as { id: string; isDefault: boolean }[];
      expect(list.find((x) => x.isDefault)?.id).toBe(c.id);
      expect(list.map((x) => x.id).sort()).toEqual([b.id, c.id].sort());
    });

    it("hides other users' addresses", async () => {
      const owner = newUser();
      const other = newUser();
      const a = (await http.post('/me/addresses').set(owner).send(home)).body;

      await http.get(`/me/addresses/${a.id}`).set(other).expect(404);
      await http.patch(`/me/addresses/${a.id}`).set(other).send({ city: 'Lahore' }).expect(404);
      await http.delete(`/me/addresses/${a.id}`).set(other).expect(404);
      expect((await http.get('/me/addresses').set(other)).body).toEqual([]);
      await http.get(`/me/addresses/${a.id}`).set(owner).expect(200);
    });

    it('validates ids and pins', async () => {
      const me = newUser();
      await http.get('/me/addresses/not-a-uuid').set(me).expect(400);
      await http
        .post('/me/addresses')
        .set(me)
        .send({ ...home, location: { lat: 25.2048, lng: 55.2708 } }) // Dubai
        .expect(400);
    });

    it('allows at most 10 addresses', async () => {
      const me = newUser();
      for (let i = 0; i < 10; i++) {
        await http.post('/me/addresses').set(me).send({ ...work, line1: `Office ${i}` }).expect(201);
      }
      const res = await http.post('/me/addresses').set(me).send(work).expect(409);
      expect(res.body.message).toMatch(/up to 10/);
    });

    it('keeps exactly one default when a new user adds addresses concurrently', async () => {
      const me = newUser();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => http.post('/me/addresses').set(me).send({ ...work, line1: `Desk ${i}` })),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
      const list = (await http.get('/me/addresses').set(me)).body as { isDefault: boolean }[];
      expect(list).toHaveLength(6);
      expect(list.filter((x) => x.isDefault)).toHaveLength(1);
    });
  });

  it('is ready when Postgres is up', async () => {
    await http.get('/readyz').expect(200, { status: 'ok' });
  });
});
