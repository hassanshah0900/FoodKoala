import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { outbox, vouchers } from './db/schema';
import { carts, fillCart, newUser, type Scenario, scenario, startApp } from './testing/e2e';

const day = 24 * 3600_000;

describe('vouchers (e2e)', () => {
  let t: Awaited<ReturnType<typeof startApp>>;
  const admin = newUser('customer,admin');
  const created: string[] = [];

  /** A code no other run has used. */
  const freshCode = () => `T${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;

  const create = async (over: Record<string, unknown> = {}) => {
    const res = await t.http
      .post('/vouchers')
      .set(admin)
      .send({
        code: freshCode(),
        description: '20% off, up to Rs 150',
        kind: 'percent',
        value: 20,
        maxDiscountPaisa: 15000,
        minSubtotalPaisa: 50000,
        startsAt: new Date(Date.now() - day).toISOString(),
        endsAt: new Date(Date.now() + day).toISOString(),
        ...over,
      })
      .expect(201);
    created.push(res.body.id);
    return res.body as { id: string; code: string; startsAt: string; endsAt: string };
  };

  const discount = (s: Scenario, code: string) => t.http.get(`/vouchers/${code}/discount`).set(s.customer);
  const used = async (id: string) => {
    const res = await t.http.get('/vouchers?limit=50').set(admin).expect(200);
    return res.body.items.find((v: { id: string }) => v.id === id).used as number;
  };
  const cancel = (s: Scenario, orderId: string) =>
    t.http.post(`/${orderId}/status`).set(s.customer).send({ status: 'cancelled' }).expect(200);

  beforeAll(async () => {
    t = await startApp();
    t.onClose(async () => {
      if (created.length) await t.db.delete(vouchers).where(inArray(vouchers.id, created));
    });
  });

  afterAll(() => t.close());

  it('lets admins create, list and change vouchers, and nobody else', async () => {
    const code = freshCode();
    const voucher = await create({ code: ` ${code.toLowerCase()} `, usageLimit: 100 });
    expect(voucher).toMatchObject({
      code,
      kind: 'percent',
      value: 20,
      maxDiscountPaisa: 15000,
      restaurantId: null,
      firstOrderOnly: false,
      usageLimit: 100,
      perCustomerLimit: 1,
      active: true,
      used: 0,
    });
    const taken = await t.http
      .post('/vouchers')
      .set(admin)
      .send({ code, description: 'x', kind: 'flat', value: 100, startsAt: voucher.startsAt, endsAt: voucher.endsAt })
      .expect(409);
    expect(taken.body.message).toBe(`The code ${code} is taken`);

    const listed = await t.http.get('/vouchers?limit=50').set(admin).expect(200);
    expect(listed.body.items.map((v: { id: string }) => v.id)).toContain(voucher.id);

    const changed = await t.http
      .patch(`/vouchers/${voucher.id}`)
      .set(admin)
      .send({ active: false, usageLimit: null })
      .expect(200);
    expect(changed.body).toMatchObject({ active: false, usageLimit: null, code });

    const customer = newUser();
    await t.http.post('/vouchers').set(customer).send({}).expect(403);
    await t.http.get('/vouchers').set(customer).expect(403);
    await t.http.patch(`/vouchers/${voucher.id}`).set(customer).send({ active: true }).expect(403);
    await t.http.patch(`/vouchers/${randomUUID()}`).set(admin).send({ active: true }).expect(404);
  });

  it('refuses vouchers that make no sense', async () => {
    const base = {
      code: freshCode(),
      description: 'x',
      kind: 'percent',
      value: 20,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + day).toISOString(),
    };
    for (const bad of [
      { value: 150 },
      { kind: 'flat', maxDiscountPaisa: 1000 },
      { endsAt: base.startsAt },
      { code: 'a b' },
      { perCustomerLimit: 0 },
    ]) {
      await t.http
        .post('/vouchers')
        .set(admin)
        .send({ ...base, ...bad })
        .expect(400);
    }
  });

  it("shows what a code takes off the customer's cart", async () => {
    const { code } = await create();
    const s = scenario();
    expect((await discount(s, code.toLowerCase()).expect(200)).body).toEqual({
      code,
      description: '20% off, up to Rs 150',
      discountPaisa: 15000,
    });
    const unknown = await discount(s, 'NOSUCHCODE').expect(422);
    expect(unknown.body.message).toEqual(['There is no voucher NOSUCHCODE']);
    await discount(scenario({ quantity: 1 }), code)
      .expect(422)
      .expect(({ body }) => expect(body.message).toEqual(['This voucher needs a subtotal of Rs 500; add Rs 50 more']));
    await t.http.get(`/vouchers/${code}/discount`).set(newUser()).expect(409);
  });

  it('takes the discount off at checkout, once per customer, and gives the use back when the order is cancelled', async () => {
    const { id, code } = await create({
      kind: 'flat',
      value: 20000,
      maxDiscountPaisa: null,
      description: 'Rs 200 off',
    });
    const s = scenario();
    const order = await t.place(s, { voucherCode: code.toLowerCase() });
    expect(order).toMatchObject({
      subtotalPaisa: 90000,
      deliveryFeePaisa: 9900,
      discountPaisa: 20000,
      voucherCode: code,
      totalPaisa: 79900,
    });
    expect((await t.http.get(`/${order.id}`).set(s.customer).expect(200)).body.voucherCode).toBe(code);
    const [event] = await t.db.select().from(outbox).where(eq(outbox.key, order.id));
    expect(event.payload).toMatchObject({
      type: 'order.placed',
      data: { totals: { subtotalPaisa: 90000, deliveryFeePaisa: 9900, discountPaisa: 20000, totalPaisa: 79900 } },
    });
    expect(await used(id)).toBe(1);

    fillCart(s.customer, s.restaurantId);
    const twice = await t.checkout(s.customer, s.addressId, { voucherCode: code }).expect(422);
    expect(twice.body.message).toEqual(['You have already used this voucher']);
    expect(carts.has(s.customer['X-User-Id'])).toBe(true);

    await cancel(s, order.id);
    expect(await used(id)).toBe(0);
    expect((await t.place(s, { voucherCode: code })).discountPaisa).toBe(20000);
  });

  it('lets only one of two racing checkouts take the last use', async () => {
    const { id, code } = await create({ usageLimit: 1 });
    const [a, b] = [scenario(), scenario()];
    const results = await Promise.all([a, b].map((s) => t.checkout(s.customer, s.addressId, { voucherCode: code })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    for (const r of results) if (r.status === 201) t.placed.push(r.body.id);
    expect(results.find((r) => r.status === 422)!.body.message).toEqual(['This voucher has been fully used']);
    expect(await used(id)).toBe(1);
  });

  it('keeps first-order vouchers for first orders and restaurant vouchers for their restaurant', async () => {
    const first = await create({ firstOrderOnly: true });
    const s = scenario();
    await t.place(s);
    fillCart(s.customer, s.restaurantId);
    const late = await t.checkout(s.customer, s.addressId, { voucherCode: first.code }).expect(422);
    expect(late.body.message).toEqual(['This voucher is for your first order only']);

    const elsewhere = await create({ restaurantId: randomUUID() });
    const other = await discount(scenario(), elsewhere.code).expect(422);
    expect(other.body.message).toEqual(['This voucher is not valid at this restaurant']);

    const s2 = scenario();
    const here = await create({ restaurantId: s2.restaurantId });
    expect((await t.place(s2, { voucherCode: here.code })).discountPaisa).toBe(15000);
  });

  it('refuses expired, paused and future vouchers', async () => {
    const s = scenario();
    const later = await create({
      startsAt: new Date(Date.now() + day).toISOString(),
      endsAt: new Date(Date.now() + 2 * day).toISOString(),
    });
    expect((await discount(s, later.code).expect(422)).body.message).toEqual(['This voucher is not valid yet']);
    const paused = await create();
    await t.http.patch(`/vouchers/${paused.id}`).set(admin).send({ active: false }).expect(200);
    expect((await discount(s, paused.code).expect(422)).body.message).toEqual(['This voucher has expired']);
  });
});
