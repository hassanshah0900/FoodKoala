import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from './app.module';
import type { Database } from './db/database';
import { categories, items } from './db/schema';
import { setupApp } from './setup-app';

/** Restaurant id -> owner id, as the stand-in restaurant-service knows them. */
const owners = new Map<string, string>();

/** A stand-in restaurant-service: `GET /{id}` shows ownerId only to the owner and admins. */
function fakeRestaurantService(): Server {
  return createServer((req, res) => {
    const id = req.url!.slice(1);
    const ownerId = owners.get(id);
    if (!ownerId) return void res.writeHead(404, { 'content-type': 'application/json' }).end('{"statusCode":404}');
    const caller = req.headers['x-user-id'];
    const admin = String(req.headers['x-user-roles'] ?? '').split(',').includes('admin');
    const body = caller === ownerId || admin ? { id, ownerId } : { id };
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
}

function newUser(roles = 'customer') {
  const phone = `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  return { 'X-User-Id': randomUUID(), 'X-User-Phone': phone, 'X-User-Roles': roles };
}

const restaurantIds: string[] = [];

/** A restaurant owned by a fresh user. */
function newRestaurant() {
  const owner = newUser();
  const id = randomUUID();
  owners.set(id, owner['X-User-Id']);
  restaurantIds.push(id);
  return { id, owner };
}

const biryani = {
  name: 'Chicken Biryani',
  description: 'Basmati rice, spiced chicken, raita on the side',
  pricePaisa: 45000,
  optionGroups: [
    {
      name: 'Choose size',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Single', pricePaisa: 0 },
        { name: 'Full (serves 2)', pricePaisa: 35000 },
      ],
    },
  ],
};

describe('menu-service (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let db: Database;
  let restaurantService: Server;

  beforeAll(async () => {
    restaurantService = fakeRestaurantService();
    await new Promise<void>((resolve) => restaurantService.listen(0, '127.0.0.1', resolve));
    process.env.RESTAURANT_SERVICE_URL = `http://127.0.0.1:${(restaurantService.address() as AddressInfo).port}`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    http = request(app.getHttpServer());
    db = app.get<Database>(getDrizzleToken());
  });

  afterAll(async () => {
    await db.delete(items).where(inArray(items.restaurantId, restaurantIds));
    await db.delete(categories).where(inArray(categories.restaurantId, restaurantIds));
    await app.close();
    await new Promise<void>((resolve) => restaurantService.close(() => resolve()));
  });

  async function category(r: { id: string; owner: Record<string, string> }, name = 'Biryani') {
    const res = await http.post(`/restaurants/${r.id}/categories`).set(r.owner).send({ name }).expect(201);
    return res.body.id as string;
  }

  it('starts with an empty menu', async () => {
    const r = newRestaurant();
    await http.get(`/restaurants/${r.id}`).expect(200, { restaurantId: r.id, categories: [] });
  });

  describe('ownership', () => {
    it('lets only the owner and admins change the menu', async () => {
      const r = newRestaurant();
      await http.post(`/restaurants/${r.id}/categories`).send({ name: 'Deals' }).expect(401);
      await http.post(`/restaurants/${r.id}/categories`).set(newUser()).send({ name: 'Deals' }).expect(403);
      await http.post(`/restaurants/${r.id}/categories`).set(newUser('admin')).send({ name: 'Deals' }).expect(201);
      const cid = await category(r);
      await http.post(`/categories/${cid}/items`).set(newUser()).send(biryani).expect(403);
      await http.delete(`/categories/${cid}`).set(newUser()).expect(403);
    });

    it('returns 404 for restaurants restaurant-service does not know', async () => {
      await http.post(`/restaurants/${randomUUID()}/categories`).set(newUser()).send({ name: 'Deals' }).expect(404);
    });
  });

  describe('building a menu', () => {
    it('adds categories and items in order, with ids for every choice', async () => {
      const r = newRestaurant();
      const mains = await category(r, 'Biryani');
      const drinks = await category(r, 'Drinks');

      const item = await http.post(`/categories/${mains}/items`).set(r.owner).send(biryani).expect(201);
      expect(item.body).toMatchObject({ restaurantId: r.id, categoryId: mains, name: 'Chicken Biryani', isAvailable: true });
      expect(item.body.optionGroups[0].id).toEqual(expect.any(String));
      expect(item.body.optionGroups[0].options.map((o: { id: string }) => o.id)).toHaveLength(2);
      await http.post(`/categories/${mains}/items`).set(r.owner).send({ name: 'Beef Pulao', pricePaisa: 40000 }).expect(201);
      await http.post(`/categories/${drinks}/items`).set(r.owner).send({ name: 'Mint Margarita', pricePaisa: 25000 }).expect(201);

      const menu = await http.get(`/restaurants/${r.id}`).expect(200);
      expect(menu.body.categories.map((c: { name: string; items: { name: string }[] }) => [c.name, c.items.map((i) => i.name)])).toEqual([
        ['Biryani', ['Chicken Biryani', 'Beef Pulao']],
        ['Drinks', ['Mint Margarita']],
      ]);
      expect(menu.body.categories[0]).not.toHaveProperty('position');
    });

    it('reorders categories and items', async () => {
      const r = newRestaurant();
      const a = await category(r, 'A');
      const b = await category(r, 'B');
      const one = (await http.post(`/categories/${a}/items`).set(r.owner).send({ name: 'One', pricePaisa: 100 })).body.id;
      const two = (await http.post(`/categories/${a}/items`).set(r.owner).send({ name: 'Two', pricePaisa: 100 })).body.id;

      await http.put(`/restaurants/${r.id}/categories/order`).set(r.owner).send({ ids: [b, a] }).expect(204);
      await http.put(`/categories/${a}/items/order`).set(r.owner).send({ ids: [two, one] }).expect(204);
      const menu = await http.get(`/restaurants/${r.id}`).expect(200);
      expect(menu.body.categories.map((c: { name: string }) => c.name)).toEqual(['B', 'A']);
      expect(menu.body.categories[1].items.map((i: { name: string }) => i.name)).toEqual(['Two', 'One']);

      await http.put(`/restaurants/${r.id}/categories/order`).set(r.owner).send({ ids: [a] }).expect(400);
      await http.put(`/categories/${a}/items/order`).set(r.owner).send({ ids: [one, randomUUID()] }).expect(400);
    });

    it('marks items sold out, keeps option ids when asked, and moves items', async () => {
      const r = newRestaurant();
      const mains = await category(r, 'Mains');
      const deals = await category(r, 'Deals');
      const created = (await http.post(`/categories/${mains}/items`).set(r.owner).send(biryani).expect(201)).body;
      const [single, full] = created.optionGroups[0].options;

      const soldOut = await http.patch(`/items/${created.id}`).set(r.owner).send({ isAvailable: false }).expect(200);
      expect(soldOut.body.isAvailable).toBe(false);

      const group = created.optionGroups[0];
      const edited = await http
        .patch(`/items/${created.id}`)
        .set(r.owner)
        .send({
          optionGroups: [
            {
              id: group.id,
              name: group.name,
              minSelect: 1,
              maxSelect: 1,
              options: [{ ...single, pricePaisa: 1000 }, { name: 'Family (serves 4)', pricePaisa: 90000 }],
            },
          ],
        })
        .expect(200);
      const options = edited.body.optionGroups[0].options;
      expect(options[0]).toEqual({ ...single, pricePaisa: 1000 });
      expect(options.map((o: { id: string }) => o.id)).not.toContain(full.id);

      const moved = await http.patch(`/items/${created.id}`).set(r.owner).send({ categoryId: deals }).expect(200);
      expect(moved.body.categoryId).toBe(deals);
      const other = newRestaurant();
      const foreign = await category(other);
      await http.patch(`/items/${created.id}`).set(r.owner).send({ categoryId: foreign }).expect(400);

      expect((await http.get(`/items/${created.id}`).expect(200)).body.name).toBe('Chicken Biryani');
    });

    it('deletes only empty categories', async () => {
      const r = newRestaurant();
      const cid = await category(r);
      const item = (await http.post(`/categories/${cid}/items`).set(r.owner).send(biryani)).body.id;
      await http.delete(`/categories/${cid}`).set(r.owner).expect(409);
      await http.delete(`/items/${item}`).set(r.owner).expect(204);
      await http.get(`/items/${item}`).expect(404);
      await http.delete(`/categories/${cid}`).set(r.owner).expect(204);
      await http.patch(`/categories/${cid}`).set(r.owner).send({ name: 'Gone' }).expect(404);
    });

    it('keeps to the category limit when categories are added at once', async () => {
      const r = newRestaurant();
      const results = await Promise.all(
        Array.from({ length: 55 }, (_, i) => http.post(`/restaurants/${r.id}/categories`).set(r.owner).send({ name: `C${i}` })),
      );
      expect(results.filter((res) => res.status === 201)).toHaveLength(50);
      const menu = await http.get(`/restaurants/${r.id}`).expect(200);
      const positions = new Set(menu.body.categories.map((c: { name: string }) => c.name));
      expect(positions.size).toBe(50);
    });
  });

  describe('pricing', () => {
    it('prices lines from the database, never from the client', async () => {
      const r = newRestaurant();
      const cid = await category(r);
      const item = (await http.post(`/categories/${cid}/items`).set(r.owner).send(biryani).expect(201)).body;
      const full = item.optionGroups[0].options[1];

      const res = await http
        .post(`/restaurants/${r.id}/price`)
        .send({ lines: [{ itemId: item.id, quantity: 2, optionIds: [full.id] }] })
        .expect(200);
      expect(res.body).toMatchObject({
        restaurantId: r.id,
        lines: [{ itemId: item.id, quantity: 2, unitPricePaisa: 80000, lineTotalPaisa: 160000 }],
        subtotalPaisa: 160000,
      });

      await http
        .post(`/restaurants/${r.id}/price`)
        .send({ lines: [{ itemId: item.id, quantity: 1, optionIds: [full.id], pricePaisa: 1 }] })
        .expect(400);
    });

    it('refuses sold-out items, missing choices and items of other restaurants with 422', async () => {
      const r = newRestaurant();
      const cid = await category(r);
      const item = (await http.post(`/categories/${cid}/items`).set(r.owner).send(biryani).expect(201)).body;
      const single = item.optionGroups[0].options[0];
      await http.patch(`/items/${item.id}`).set(r.owner).send({ isAvailable: false }).expect(200);

      const res = await http
        .post(`/restaurants/${r.id}/price`)
        .send({ lines: [{ itemId: item.id, quantity: 1, optionIds: [single.id] }, { itemId: item.id, quantity: 1 }] })
        .expect(422);
      expect(res.body.message).toEqual([
        'lines[0]: Chicken Biryani is sold out',
        'lines[1]: Chicken Biryani is sold out',
        'lines[1]: choose 1 in "Choose size"',
      ]);

      const other = newRestaurant();
      const res2 = await http
        .post(`/restaurants/${other.id}/price`)
        .send({ lines: [{ itemId: item.id, quantity: 1, optionIds: [single.id] }] })
        .expect(422);
      expect(res2.body.message).toEqual([`lines[0]: item ${item.id} is not on this menu`]);
    });
  });
});
