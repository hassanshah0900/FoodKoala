import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { orders } from './db/schema';
import { anotherCustomer, fillCart, newUser, scenario, startApp } from './testing/e2e';

describe('restaurant sales report (e2e)', () => {
  let t: Awaited<ReturnType<typeof startApp>>;
  const admin = newUser('customer,admin');

  beforeAll(async () => {
    t = await startApp();
  });

  afterAll(() => t.close());

  const report = (who: Record<string, string>, restaurantId: string, query = '') =>
    t.http.get(`/restaurants/${restaurantId}/report${query}`).set(who);

  it("sums the restaurant's orders for its owner and admins", async () => {
    const s = scenario();
    const broast = randomUUID();
    const zinger = randomUUID();

    // Two delivered orders of 2 and 3 broasts, one of 1 zinger, one cancelled, one rejected.
    fillCart(s.customer, s.restaurantId, 2, broast);
    await t.deliver(s, (await t.place(s)).id);
    const b = anotherCustomer(s);
    fillCart(b.customer, s.restaurantId, 3, broast);
    await t.deliver(b, (await t.place(b)).id);
    const c = anotherCustomer(s);
    fillCart(c.customer, s.restaurantId, 2, zinger);
    await t.deliver(c, (await t.place(c)).id);
    const d = anotherCustomer(s);
    const cancelled = await t.place(d);
    await t.http.post(`/${cancelled.id}/status`).set(d.customer).send({ status: 'cancelled' }).expect(200);
    const e = anotherCustomer(s);
    const rejected = await t.place(e);
    await t.http
      .post(`/${rejected.id}/status`)
      .set(s.owner)
      .send({ status: 'rejected', reason: 'Out of chicken' })
      .expect(200);

    const res = await report(s.owner, s.restaurantId).expect(200);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
    expect(res.body).toEqual({
      restaurantId: s.restaurantId,
      from: expect.any(String),
      to: expect.any(String),
      timeZone: 'Asia/Karachi',
      orders: { placed: 5, delivered: 3, cancelled: 1, rejected: 1 },
      salesPaisa: 7 * 45000,
      discountsPaisa: 0,
      averageOrderPaisa: 105000,
      averagePrepMinutes: 15,
      topItems: [
        { itemId: broast, name: 'Chicken Broast', quantity: 5, salesPaisa: 5 * 45000 },
        { itemId: zinger, name: 'Chicken Broast', quantity: 2, salesPaisa: 2 * 45000 },
      ],
      days: [{ date: today, placed: 5, delivered: 3, salesPaisa: 7 * 45000 }],
    });
    expect(Date.parse(res.body.to) - Date.parse(res.body.from)).toBe(7 * 24 * 3600_000);
    await report(admin, s.restaurantId).expect(200);
    await report(s.customer, s.restaurantId).expect(403);
  });

  it('counts only the period asked for, by day in Pakistan', async () => {
    const s = scenario();
    const order = await t.place(s);
    await t.deliver(s, order.id);
    // Placed at 23:30 Karachi time on 1 November.
    await t.db
      .update(orders)
      .set({ placedAt: new Date('2026-11-01T18:30:00Z') })
      .where(eq(orders.id, order.id));

    const nov = '?from=2026-11-01T00:00:00%2B05:00&to=2026-11-08T00:00:00%2B05:00';
    const res = await report(s.owner, s.restaurantId, nov).expect(200);
    expect(res.body.days).toEqual([{ date: '2026-11-01', placed: 1, delivered: 1, salesPaisa: 90000 }]);
    const after = await report(
      s.owner,
      s.restaurantId,
      '?from=2026-11-02T00:00:00%2B05:00&to=2026-11-03T00:00:00%2B05:00',
    );
    expect(after.body).toMatchObject({
      orders: { placed: 0, delivered: 0 },
      salesPaisa: 0,
      averageOrderPaisa: null,
      averagePrepMinutes: null,
      topItems: [],
      days: [],
    });
  });

  it('refuses periods that are backwards or too long, and unknown restaurants', async () => {
    const s = scenario();
    await report(s.owner, s.restaurantId, '?from=2026-11-08T00:00:00Z&to=2026-11-01T00:00:00Z').expect(400);
    await report(s.owner, s.restaurantId, '?from=2026-01-01T00:00:00Z&to=2026-11-01T00:00:00Z').expect(400);
    await report(s.owner, s.restaurantId, '?from=yesterday').expect(400);
    await report(s.owner, randomUUID()).expect(404);
    await report(admin, 'not-an-id').expect(400);
  });
});
