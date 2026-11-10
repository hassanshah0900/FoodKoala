import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from './app.module';
import { REDIS } from './redis/redis.module';
import { setupApp } from './setup-app';

interface FakeItem {
  restaurantId: string;
  name: string;
  pricePaisa: number;
  available: boolean;
  options: Record<string, { name: string; pricePaisa: number }>;
}

/** The stand-in menu: item id -> item. */
const menu = new Map<string, FakeItem>();
let menuDown = false;

/** A stand-in menu-service implementing POST /restaurants/{id}/price with the same 422 messages. */
function fakeMenuService(): Server {
  return createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const send = (status: number, body: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      if (menuDown) return send(500, { statusCode: 500 });
      const restaurantId = req.url!.split('/')[2];
      const { lines } = JSON.parse(raw) as { lines: { itemId: string; quantity: number; optionIds: string[] }[] };
      const problems: string[] = [];
      const priced = lines.map((line, i) => {
        const item = menu.get(line.itemId);
        if (!item || item.restaurantId !== restaurantId) {
          problems.push(`lines[${i}]: item ${line.itemId} is not on this menu`);
          return null;
        }
        if (!item.available) problems.push(`lines[${i}]: ${item.name} is sold out`);
        const options = line.optionIds.flatMap((id) => {
          const o = item.options[id];
          if (!o) problems.push(`lines[${i}]: option ${id} is not a choice of ${item.name}`);
          return o ? [{ id, group: 'Choose size', ...o }] : [];
        });
        const unit = item.pricePaisa + options.reduce((s, o) => s + o.pricePaisa, 0);
        return {
          itemId: line.itemId,
          name: item.name,
          quantity: line.quantity,
          options,
          unitPricePaisa: unit,
          lineTotalPaisa: unit * line.quantity,
        };
      });
      if (problems.length) return send(422, { statusCode: 422, message: problems });
      const ok = priced.filter((p) => p !== null);
      send(200, { restaurantId, lines: ok, subtotalPaisa: ok.reduce((s, l) => s + l.lineTotalPaisa, 0) });
    });
  });
}

/** Past orders in the stand-in order-service: order id -> owner and body. */
const pastOrders = new Map<string, { customerId: string; body: object }>();
let ordersDown = false;
let orderHeaders: Record<string, string | string[] | undefined> = {};

/** A stand-in order-service: GET /{id} shows an order to its customer only. */
function fakeOrderService(): Server {
  return createServer((req, res) => {
    orderHeaders = req.headers;
    if (ordersDown) return void res.writeHead(503).end();
    const order = pastOrders.get(req.url!.slice(1));
    if (!order || order.customerId !== req.headers['x-user-id']) {
      return void res.writeHead(404, { 'content-type': 'application/json' }).end('{"statusCode":404}');
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(order.body));
  });
}

interface PastLine {
  itemId: string;
  name: string;
  quantity: number;
  optionIds?: string[];
  note?: string | null;
}

/** An order of `customerId` in the stand-in order-service, shaped like Order in the contract. */
function pastOrder(customerId: string, restaurantId: string, lines: PastLine[]) {
  const id = randomUUID();
  pastOrders.set(id, {
    customerId,
    body: {
      id,
      status: 'delivered',
      restaurant: { id: restaurantId, name: 'Somewhere', location: null },
      lines: lines.map((l) => ({
        itemId: l.itemId,
        name: l.name,
        quantity: l.quantity,
        options: (l.optionIds ?? []).map((o) => ({ id: o, group: 'Choose size', name: 'Full', pricePaisa: 1 })),
        note: l.note ?? null,
        unitPricePaisa: 1,
        lineTotalPaisa: l.quantity,
      })),
    },
  });
  return id;
}

function newUser() {
  const phone = `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  return { 'X-User-Id': randomUUID(), 'X-User-Phone': phone, 'X-User-Roles': 'customer' };
}

/** A menu item in the stand-in menu. */
function newItem(restaurantId: string, name = 'Chicken Biryani', pricePaisa = 45000) {
  const id = randomUUID();
  const full = randomUUID();
  menu.set(id, {
    restaurantId,
    name,
    pricePaisa,
    available: true,
    options: { [full]: { name: 'Full', pricePaisa: 35000 } },
  });
  return { id, full };
}

describe('cart-service (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let redis: Redis;
  let menuService: Server;
  let orderService: Server;
  const users: string[] = [];

  const user = () => {
    const u = newUser();
    users.push(u['X-User-Id']);
    return u;
  };

  beforeAll(async () => {
    menuService = fakeMenuService();
    await new Promise<void>((resolve) => menuService.listen(0, '127.0.0.1', resolve));
    process.env.MENU_SERVICE_URL = `http://127.0.0.1:${(menuService.address() as AddressInfo).port}`;
    orderService = fakeOrderService();
    await new Promise<void>((resolve) => orderService.listen(0, '127.0.0.1', resolve));
    process.env.ORDER_SERVICE_URL = `http://127.0.0.1:${(orderService.address() as AddressInfo).port}`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    http = request(app.getHttpServer());
    redis = app.get<Redis>(REDIS);
  });

  afterAll(async () => {
    if (users.length) await redis.del(...users.map((u) => `cart:${u}`));
    await app.close();
    await new Promise<void>((resolve) => menuService.close(() => resolve()));
    await new Promise<void>((resolve) => orderService.close(() => resolve()));
  });

  afterEach(() => {
    menuDown = false;
    ordersDown = false;
  });

  it('needs a signed-in user', async () => {
    await http.get('/').expect(401);
  });

  it('starts empty', async () => {
    await http
      .get('/')
      .set(user())
      .expect(200, { restaurantId: null, lines: [], subtotalPaisa: 0, problems: [], updatedAt: null });
  });

  it('adds items with menu prices and merges equal lines', async () => {
    const me = user();
    const restaurantId = randomUUID();
    const biryani = newItem(restaurantId);

    const first = await http
      .post('/items')
      .set(me)
      .send({ restaurantId, itemId: biryani.id, quantity: 1, optionIds: [biryani.full] })
      .expect(201);
    expect(first.body).toMatchObject({
      restaurantId,
      lines: [
        {
          itemId: biryani.id,
          name: 'Chicken Biryani',
          quantity: 1,
          optionIds: [biryani.full],
          unitPricePaisa: 80000,
          lineTotalPaisa: 80000,
        },
      ],
      subtotalPaisa: 80000,
      problems: [],
    });

    const merged = await http
      .post('/items')
      .set(me)
      .send({ restaurantId, itemId: biryani.id, quantity: 2, optionIds: [biryani.full] })
      .expect(201);
    expect(merged.body.lines).toHaveLength(1);
    expect(merged.body).toMatchObject({ lines: [{ quantity: 3, lineTotalPaisa: 240000 }], subtotalPaisa: 240000 });

    const withNote = await http
      .post('/items')
      .set(me)
      .send({ restaurantId, itemId: biryani.id, quantity: 1, note: 'Less spicy' })
      .expect(201);
    expect(withNote.body.lines).toHaveLength(2);

    const ttl = await redis.ttl(`cart:${me['X-User-Id']}`);
    expect(ttl).toBeGreaterThan(6 * 24 * 3600);

    await http
      .post('/items')
      .set(me)
      .send({ restaurantId, itemId: biryani.id, quantity: 1, pricePaisa: 1 })
      .expect(400);
  });

  it('holds one restaurant at a time unless asked to replace', async () => {
    const me = user();
    const a = randomUUID();
    const b = randomUUID();
    const fromA = newItem(a);
    const fromB = newItem(b, 'Zinger Burger', 55000);
    await http.post('/items').set(me).send({ restaurantId: a, itemId: fromA.id, quantity: 1 }).expect(201);
    await http.post('/items').set(me).send({ restaurantId: b, itemId: fromB.id, quantity: 1 }).expect(409);
    const replaced = await http
      .post('/items')
      .set(me)
      .send({ restaurantId: b, itemId: fromB.id, quantity: 1, replace: true })
      .expect(201);
    expect(replaced.body).toMatchObject({ restaurantId: b, lines: [{ name: 'Zinger Burger' }] });
  });

  it("refuses items that don't match the menu with menu-service's reasons", async () => {
    const me = user();
    const restaurantId = randomUUID();
    const item = newItem(restaurantId);
    menu.get(item.id)!.available = false;
    const res = await http.post('/items').set(me).send({ restaurantId, itemId: item.id, quantity: 1 }).expect(422);
    expect(res.body.message).toEqual(['Chicken Biryani is sold out']);
    await http.post('/items').set(me).send({ restaurantId: randomUUID(), itemId: item.id, quantity: 1 }).expect(422);
    await http
      .get('/')
      .set(me)
      .expect(200, { restaurantId: null, lines: [], subtotalPaisa: 0, problems: [], updatedAt: null });
  });

  it('changes and removes lines', async () => {
    const me = user();
    const restaurantId = randomUUID();
    const item = newItem(restaurantId);
    const cart = (await http.post('/items').set(me).send({ restaurantId, itemId: item.id, quantity: 1 })).body;
    const lineId = cart.lines[0].id;

    const changed = await http
      .patch(`/items/${lineId}`)
      .set(me)
      .send({ quantity: 4, optionIds: [item.full], note: 'No raita' })
      .expect(200);
    expect(changed.body.lines[0]).toMatchObject({ id: lineId, quantity: 4, note: 'No raita', unitPricePaisa: 80000 });

    await http
      .patch(`/items/${lineId}`)
      .set(me)
      .send({ optionIds: [randomUUID()] })
      .expect(422);
    await http.patch(`/items/${randomUUID()}`).set(me).send({ quantity: 2 }).expect(404);
    await http.patch(`/items/${lineId}`).set(user()).send({ quantity: 2 }).expect(404);

    const emptied = await http.delete(`/items/${lineId}`).set(me).expect(200);
    expect(emptied.body).toMatchObject({ restaurantId: null, lines: [] });
    expect(await redis.exists(`cart:${me['X-User-Id']}`)).toBe(0);
  });

  it('keeps lines that sold out after being added, and lists them as problems', async () => {
    const me = user();
    const restaurantId = randomUUID();
    const biryani = newItem(restaurantId);
    const raita = newItem(restaurantId, 'Raita', 5000);
    await http.post('/items').set(me).send({ restaurantId, itemId: biryani.id, quantity: 1 }).expect(201);
    const cart = (await http.post('/items').set(me).send({ restaurantId, itemId: raita.id, quantity: 2 }).expect(201))
      .body;

    menu.get(raita.id)!.available = false;
    menu.get(biryani.id)!.pricePaisa = 99999;
    const res = await http.get('/').set(me).expect(200);
    expect(res.body).toMatchObject({
      lines: [
        { name: 'Chicken Biryani', unitPricePaisa: 45000 },
        { name: 'Raita', quantity: 2, lineTotalPaisa: 10000 },
      ],
      subtotalPaisa: 55000,
      problems: [{ lineId: cart.lines[1].id, message: 'Raita is sold out' }],
    });

    menu.get(raita.id)!.available = true;
    expect((await http.get('/').set(me).expect(200)).body).toMatchObject({
      problems: [],
      lines: [{ unitPricePaisa: 99999 }, {}],
    });
  });

  it('loses no update when items are added at the same time', async () => {
    const me = user();
    const restaurantId = randomUUID();
    const items = Array.from({ length: 10 }, (_, i) => newItem(restaurantId, `Item ${i}`, 1000));
    const results = await Promise.all(
      items.map((it) => http.post('/items').set(me).send({ restaurantId, itemId: it.id, quantity: 1 })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const cart = (await http.get('/').set(me).expect(200)).body;
    expect(cart.lines).toHaveLength(10);
    expect(cart.subtotalPaisa).toBe(10000);
  });

  it('answers 503 when menu-service fails, and clears without it', async () => {
    const me = user();
    const restaurantId = randomUUID();
    const item = newItem(restaurantId);
    await http.post('/items').set(me).send({ restaurantId, itemId: item.id, quantity: 1 }).expect(201);
    menuDown = true;
    await http.get('/').set(me).expect(503);
    await http.post('/items').set(me).send({ restaurantId, itemId: item.id, quantity: 1 }).expect(503);
    await http.delete('/').set(me).expect(204);
    menuDown = false;
    expect((await http.get('/').set(me).expect(200)).body.lines).toEqual([]);
  });

  describe('reorder', () => {
    it("puts the lines of a past order back, at today's prices", async () => {
      const me = user();
      const restaurantId = randomUUID();
      const biryani = newItem(restaurantId, 'Chicken Biryani', 45000);
      const raita = newItem(restaurantId, 'Raita', 8000);
      const orderId = pastOrder(me['X-User-Id'], restaurantId, [
        { itemId: biryani.id, name: 'Chicken Biryani', quantity: 2, optionIds: [biryani.full], note: 'Extra spicy' },
        { itemId: raita.id, name: 'Raita', quantity: 1 },
      ]);

      const res = await http.post('/reorder').set(me).send({ orderId }).expect(201);
      expect(res.body.skipped).toEqual([]);
      expect(res.body.cart).toMatchObject({
        restaurantId,
        lines: [
          { itemId: biryani.id, quantity: 2, optionIds: [biryani.full], note: 'Extra spicy', unitPricePaisa: 80000 },
          { itemId: raita.id, quantity: 1, optionIds: [], note: null, unitPricePaisa: 8000 },
        ],
        subtotalPaisa: 168000,
        problems: [],
      });
      expect(orderHeaders['x-user-id']).toBe(me['X-User-Id']);

      // Again: equal lines merge, like adding them one by one.
      const again = await http.post('/reorder').set(me).send({ orderId }).expect(201);
      expect(again.body.cart.lines.map((l: { quantity: number }) => l.quantity)).toEqual([4, 2]);
    });

    it('leaves out what the menu can no longer serve, and says why', async () => {
      const me = user();
      const restaurantId = randomUUID();
      const biryani = newItem(restaurantId);
      const kheer = newItem(restaurantId, 'Kheer', 15000);
      const removedOption = randomUUID();
      menu.get(kheer.id)!.available = false;
      const orderId = pastOrder(me['X-User-Id'], restaurantId, [
        { itemId: biryani.id, name: 'Chicken Biryani', quantity: 1 },
        { itemId: kheer.id, name: 'Kheer', quantity: 2 },
        { itemId: randomUUID(), name: 'Old Special', quantity: 1 },
        { itemId: biryani.id, name: 'Chicken Biryani', quantity: 1, optionIds: [removedOption] },
      ]);

      const res = await http.post('/reorder').set(me).send({ orderId }).expect(201);
      expect(res.body.cart.lines).toMatchObject([{ itemId: biryani.id, quantity: 1, optionIds: [] }]);
      expect(res.body.skipped).toEqual([
        { itemId: kheer.id, name: 'Kheer', reason: 'Kheer is sold out' },
        { itemId: expect.any(String), name: 'Old Special', reason: expect.stringMatching(/is not on this menu/) },
        {
          itemId: biryani.id,
          name: 'Chicken Biryani',
          reason: `option ${removedOption} is not a choice of Chicken Biryani`,
        },
      ]);
    });

    it('answers 422 when nothing can be added, and leaves the cart alone', async () => {
      const me = user();
      const restaurantId = randomUUID();
      const kheer = newItem(restaurantId, 'Kheer', 15000);
      menu.get(kheer.id)!.available = false;
      const orderId = pastOrder(me['X-User-Id'], restaurantId, [{ itemId: kheer.id, name: 'Kheer', quantity: 1 }]);
      const res = await http.post('/reorder').set(me).send({ orderId }).expect(422);
      expect(res.body.message).toEqual(['Kheer: Kheer is sold out']);
      expect((await http.get('/').set(me).expect(200)).body.lines).toEqual([]);
    });

    it('needs replace to swap a cart from another restaurant', async () => {
      const me = user();
      const other = randomUUID();
      const tea = newItem(other, 'Doodh Patti', 9000);
      await http.post('/items').set(me).send({ restaurantId: other, itemId: tea.id, quantity: 1 }).expect(201);
      const restaurantId = randomUUID();
      const biryani = newItem(restaurantId);
      const orderId = pastOrder(me['X-User-Id'], restaurantId, [
        { itemId: biryani.id, name: 'Chicken Biryani', quantity: 1 },
      ]);

      await http.post('/reorder').set(me).send({ orderId }).expect(409);
      expect((await http.get('/').set(me).expect(200)).body.restaurantId).toBe(other);
      const res = await http.post('/reorder').set(me).send({ orderId, replace: true }).expect(201);
      expect(res.body.cart).toMatchObject({ restaurantId, lines: [{ itemId: biryani.id }] });
    });

    it('only reorders my own orders', async () => {
      const someoneElse = randomUUID();
      const restaurantId = randomUUID();
      const biryani = newItem(restaurantId);
      const orderId = pastOrder(someoneElse, restaurantId, [
        { itemId: biryani.id, name: 'Chicken Biryani', quantity: 1 },
      ]);
      await http.post('/reorder').set(user()).send({ orderId }).expect(404);
      await http.post('/reorder').set(user()).send({ orderId: 'nope' }).expect(400);
      await http.post('/reorder').send({ orderId }).expect(401);
    });

    it('answers 503 when order-service fails', async () => {
      ordersDown = true;
      await http.post('/reorder').set(user()).send({ orderId: randomUUID() }).expect(503);
    });
  });
});
