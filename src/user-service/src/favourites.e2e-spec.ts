import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from './app.module';
import type { Database } from './db/database';
import { profiles } from './db/schema';
import { setupApp } from './setup-app';

/** What the stand-in restaurant-service lists; anything else is 404. */
const listed = new Map<string, { id: string; name: string; openNow: boolean }>();
let restaurantServiceDown = false;
let anonymous = true;

function fakeRestaurantService(): Server {
  return createServer((req, res) => {
    if (req.headers['x-user-id']) anonymous = false;
    if (restaurantServiceDown) return void res.writeHead(502).end();
    const r = listed.get(req.url!.slice(1));
    if (!r) return void res.writeHead(404, { 'content-type': 'application/json' }).end('{"statusCode":404}');
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(r));
  });
}

function restaurant(name: string) {
  const r = { id: randomUUID(), name, openNow: true };
  listed.set(r.id, r);
  return r;
}

const createdUsers: string[] = [];
function newUser() {
  const id = randomUUID();
  createdUsers.push(id);
  return { 'X-User-Id': id, 'X-User-Phone': '+923001234567', 'X-User-Roles': 'customer' };
}

describe('favourites (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let server: Server;

  beforeAll(async () => {
    server = fakeRestaurantService();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.RESTAURANT_SERVICE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.MAX_FAVOURITES_PER_USER = '3';
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.MAX_FAVOURITES_PER_USER;
  });

  afterEach(() => {
    restaurantServiceDown = false;
  });

  it('needs a signed-in user', async () => {
    await http.get('/me/favourites').expect(401);
    await http.put(`/me/favourites/${randomUUID()}`).expect(401);
  });

  it('adds, lists newest first with the restaurant, and removes, idempotently', async () => {
    const me = newUser();
    const karahi = restaurant('Karahi Corner');
    const nihari = restaurant('Nihari Inn');

    await http.get('/me/favourites').set(me).expect(200, []);
    await http.put(`/me/favourites/${karahi.id}`).set(me).expect(204);
    await http.put(`/me/favourites/${nihari.id}`).set(me).expect(204);
    await http.put(`/me/favourites/${karahi.id}`).set(me).expect(204); // again: still one

    const res = await http.get('/me/favourites').set(me).expect(200);
    expect(res.body).toEqual([
      { restaurantId: nihari.id, addedAt: expect.any(String), restaurant: nihari },
      { restaurantId: karahi.id, addedAt: expect.any(String), restaurant: karahi },
    ]);
    expect(anonymous).toBe(true); // asked as a customer would, not with the caller's identity

    await http.delete(`/me/favourites/${karahi.id}`).set(me).expect(204);
    await http.delete(`/me/favourites/${karahi.id}`).set(me).expect(204);
    const after = await http.get('/me/favourites').set(me).expect(200);
    expect(after.body.map((f: { restaurantId: string }) => f.restaurantId)).toEqual([nihari.id]);

    // Someone else's list is their own.
    await http.get('/me/favourites').set(newUser()).expect(200, []);
  });

  it('keeps a favourite whose restaurant is no longer listed, without it', async () => {
    const me = newUser();
    const r = restaurant('Closing Down');
    await http.put(`/me/favourites/${r.id}`).set(me).expect(204);
    listed.delete(r.id);
    const res = await http.get('/me/favourites').set(me).expect(200);
    expect(res.body).toEqual([{ restaurantId: r.id, addedAt: expect.any(String), restaurant: null }]);
  });

  it('only adds listed restaurants', async () => {
    const me = newUser();
    await http.put(`/me/favourites/${randomUUID()}`).set(me).expect(404);
    await http.put('/me/favourites/not-a-uuid').set(me).expect(400);
  });

  it('limits how many', async () => {
    const me = newUser();
    for (const name of ['A', 'B', 'C'])
      await http
        .put(`/me/favourites/${restaurant(name).id}`)
        .set(me)
        .expect(204);
    const res = await http
      .put(`/me/favourites/${restaurant('D').id}`)
      .set(me)
      .expect(409);
    expect(res.body.message).toMatch(/up to 3 favourites/);
  });

  it('fails closed with 503 while restaurant-service is down', async () => {
    const me = newUser();
    const r = restaurant('Fine');
    await http.put(`/me/favourites/${r.id}`).set(me).expect(204);
    restaurantServiceDown = true;
    await http
      .put(`/me/favourites/${restaurant('Other').id}`)
      .set(me)
      .expect(503);
    await http.get('/me/favourites').set(me).expect(503);
    await http.delete(`/me/favourites/${r.id}`).set(me).expect(204); // removing needs no lookup
  });
});
