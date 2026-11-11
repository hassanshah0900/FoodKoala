import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import type { Database } from './db/database';
import { notifications, smsMessages } from './db/schema';
import { OrderEventConsumer } from './orders/order-event-consumer';
import { setupApp } from './setup-app';
import { SmsDispatcher } from './sms/sms-dispatcher';
import { SMS_SENDER, SmsError, type SmsSender } from './sms/sms-sender';

/** Records texts; `next` decides how the following sends go. */
class FakeSender implements SmsSender {
  sent: { phone: string; body: string }[] = [];
  next: (Error | null)[] = [];
  async send(phone: string, body: string) {
    const outcome = this.next.shift();
    if (outcome) throw outcome;
    this.sent.push({ phone, body });
    return `SM${this.sent.length}`;
  }
}

const phone = () => `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

function statusChanged(customerId: string, to: string, extra: object = {}) {
  return {
    id: randomUUID(),
    type: 'order.status_changed',
    version: 1,
    occurredAt: new Date().toISOString(),
    source: 'order-service',
    data: {
      orderId: randomUUID(),
      customerId,
      customerPhone: phone(),
      restaurantId: randomUUID(),
      restaurantName: 'Karachi Broast',
      from: 'placed',
      to,
      by: 'restaurant',
      reason: null,
      prepTimeMinutes: 20,
      estimatedDeliveryAt: '2026-11-08T15:05:00.000Z',
      at: new Date().toISOString(),
      ...extra,
    },
  };
}

describe('notification-service (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let db: Database;
  let consumer: OrderEventConsumer;
  let dispatcher: SmsDispatcher;
  const sender = new FakeSender();
  const users: string[] = [];

  const user = () => {
    const id = randomUUID();
    users.push(id);
    return id;
  };
  const as = (userId: string) => ({ 'X-User-Id': userId, 'X-User-Phone': '+923001234567', 'X-User-Roles': 'customer' });
  const deliver = (event: object, offset = '0') =>
    consumer.handle('order.status_changed', 0, { value: Buffer.from(JSON.stringify(event)), offset });
  const smsOf = async (userId: string) =>
    db
      .select({ sms: smsMessages })
      .from(smsMessages)
      .innerJoin(notifications, eq(smsMessages.notificationId, notifications.id))
      .where(eq(notifications.userId, userId))
      .then((rows) => rows.map((r) => r.sms));

  beforeAll(async () => {
    delete process.env.KAFKA_BROKERS;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_SENDER)
      .useValue(sender)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    // init() without the sender loop: these tests call sendDue themselves.
    await app.init();
    dispatcher = app.get(SmsDispatcher);
    await dispatcher.onApplicationShutdown();
    http = request(app.getHttpServer());
    db = app.get<Database>(getDrizzleToken());
    consumer = app.get(OrderEventConsumer);
  });

  afterAll(async () => {
    if (users.length) await db.delete(notifications).where(inArray(notifications.userId, users));
    await app.close();
  });

  beforeEach(() => {
    sender.sent = [];
    sender.next = [];
  });

  it('turns an accepted order into an inbox entry and one queued text, even when replayed', async () => {
    const me = user();
    const event = statusChanged(me, 'accepted');
    await deliver(event);
    await deliver(event, '1'); // Kafka redelivers

    const inbox = await http.get('/').set(as(me)).expect(200);
    expect(inbox.body).toMatchObject({
      unreadCount: 1,
      hasMore: false,
      items: [{ kind: 'order_accepted', title: 'Order accepted', read: false }],
    });
    expect(inbox.body.items[0].data).toEqual({ orderId: event.data.orderId });
    expect(await smsOf(me)).toEqual([
      expect.objectContaining({ status: 'queued', phone: event.data.customerPhone, attempts: 0 }),
    ]);

    await dispatcher.sendDue();
    expect(sender.sent.filter((s) => s.phone === event.data.customerPhone)).toHaveLength(1);
    expect(await smsOf(me)).toEqual([
      expect.objectContaining({ status: 'sent', providerId: expect.stringMatching(/^SM/), attempts: 1 }),
    ]);
  });

  it('tells the customer who their rider is and texts the rider the job, once each', async () => {
    const [me, rider] = [user(), user()];
    const riderPhone = phone();
    const event = {
      id: randomUUID(),
      type: 'delivery.assigned',
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'delivery-service',
      data: {
        deliveryId: randomUUID(),
        orderId: randomUUID(),
        riderId: rider,
        riderName: 'Ali Raza',
        riderPhone,
        vehicle: 'motorbike',
        at: new Date().toISOString(),
        customerId: me,
        customerPhone: phone(),
        restaurantName: 'Karachi Broast',
      },
    };
    await consumer.handle('delivery.assigned', 0, { value: Buffer.from(JSON.stringify(event)), offset: '0' });
    await consumer.handle('delivery.assigned', 0, { value: Buffer.from(JSON.stringify(event)), offset: '1' }); // redelivered

    const mine = (await http.get('/').set(as(me)).expect(200)).body.items;
    expect(mine).toEqual([
      expect.objectContaining({
        kind: 'rider_assigned',
        title: 'Rider assigned',
        data: { orderId: event.data.orderId, riderId: rider },
      }),
    ]);
    expect(mine[0].body).toContain('Ali Raza is bringing your order');
    const theirs = (await http.get('/').set(as(rider)).expect(200)).body.items;
    expect(theirs).toEqual([expect.objectContaining({ kind: 'delivery_assigned', title: 'New delivery' })]);
    expect(await smsOf(me)).toEqual([]);
    expect(await smsOf(rider)).toEqual([expect.objectContaining({ phone: riderPhone, status: 'queued' })]);

    await dispatcher.sendDue();
    expect(sender.sent).toEqual([{ phone: riderPhone, body: expect.stringContaining('FoodKoala: New delivery') }]);
  });

  it("tells someone about chat messages they haven't read, in the inbox and by text, once", async () => {
    const me = user();
    const myPhone = phone();
    const event = {
      id: randomUUID(),
      type: 'chat.message_waiting',
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'chat-service',
      data: {
        orderId: randomUUID(),
        recipientId: me,
        recipientRole: 'customer',
        recipientPhone: myPhone,
        senderRole: 'rider',
        senderName: 'Ali Raza',
        restaurantName: 'Karachi Broast',
        unread: 2,
        preview: "I'm outside",
        photo: false,
        since: new Date().toISOString(),
      },
    };
    await consumer.handle('chat.message_waiting', 0, { value: Buffer.from(JSON.stringify(event)), offset: '0' });
    await consumer.handle('chat.message_waiting', 0, { value: Buffer.from(JSON.stringify(event)), offset: '1' });

    const mine = (await http.get('/').set(as(me)).expect(200)).body.items;
    expect(mine).toEqual([
      expect.objectContaining({
        kind: 'chat_message',
        title: 'Message from Ali',
        body: 'Ali: "I\'m outside" (2 new messages)',
        data: { orderId: event.data.orderId, chat: 'customer' },
      }),
    ]);
    await dispatcher.sendDue();
    expect(sender.sent).toEqual([{ phone: myPhone, body: expect.stringContaining('Ali, your rider, sent you') }]);
  });

  it('keeps quiet updates in the inbox without texting', async () => {
    const me = user();
    await deliver(statusChanged(me, 'ready', { from: 'accepted' }));
    await deliver(statusChanged(me, 'cancelled', { by: 'customer' }));
    expect((await http.get('/').set(as(me)).expect(200)).body.items).toHaveLength(2);
    expect(await smsOf(me)).toEqual([]);
  });

  it('skips malformed events instead of blocking', async () => {
    await consumer.handle('order.status_changed', 0, { value: Buffer.from('not json'), offset: '7' });
    await deliver({ id: randomUUID(), type: 'order.status_changed', data: { orderId: 'x' } });
  });

  it('retries a failed text with back-off, gives up on a permanent failure or after the last attempt', async () => {
    const [flaky, bad, hopeless] = [user(), user(), user()];
    await deliver(statusChanged(flaky, 'picked_up', { from: 'ready', by: 'admin' }));
    await deliver(statusChanged(bad, 'picked_up', { from: 'ready', by: 'admin' }));
    await deliver(statusChanged(hopeless, 'picked_up', { from: 'ready', by: 'admin' }));
    const order = [flaky, bad, hopeless];
    // Sends go oldest first: flaky's outage, bad's invalid number, hopeless's outage.
    sender.next = [
      new SmsError('Twilio answered 503', true),
      new SmsError('invalid number', false),
      new Error('socket hang up'),
    ];
    const now = new Date();
    await dispatcher.sendDue(now);

    const [f, b, h] = await Promise.all(order.map(async (u) => (await smsOf(u))[0]));
    expect(f).toMatchObject({ status: 'queued', attempts: 1, lastError: 'Twilio answered 503' });
    expect(f.nextAttemptAt.getTime()).toBe(now.getTime() + 30_000);
    expect(b).toMatchObject({ status: 'failed', attempts: 1, lastError: 'invalid number' });

    // Not due yet: nothing is sent.
    await dispatcher.sendDue(new Date(now.getTime() + 10_000));
    expect(sender.sent).toHaveLength(0);

    // Later the outage is over for flaky; hopeless keeps failing until the last attempt.
    const max = loadConfig().SMS_MAX_ATTEMPTS;
    let t = now.getTime();
    for (let attempt = 2; attempt <= max; attempt++) {
      t += 3_600_000;
      sender.next = attempt === 2 ? [null, new Error('down')] : [new Error('down')];
      await dispatcher.sendDue(new Date(t));
    }
    expect((await smsOf(flaky))[0]).toMatchObject({ status: 'sent', attempts: 2 });
    expect((await smsOf(hopeless))[0]).toMatchObject({ status: 'failed', attempts: max });
    expect(h.status).toBe('queued');
  });

  it('never texts twice when two senders run at once', async () => {
    const me = user();
    for (let i = 0; i < 5; i++) await deliver(statusChanged(me, 'accepted'));
    const slow = {
      send: async (p: string, b: string) => {
        await new Promise((r) => setTimeout(r, 20));
        return sender.send(p, b);
      },
    };
    const other = new SmsDispatcher(db, loadConfig(), slow);
    await Promise.all([dispatcher.sendDue(), other.sendDue()]);
    const mine = await smsOf(me);
    expect(mine.every((s) => s.status === 'sent' && s.attempts === 1)).toBe(true);
    expect(sender.sent.filter((s) => mine.some((m) => m.phone === s.phone))).toHaveLength(5);
  });

  it('orders the inbox by when things happened, not when the events arrived', async () => {
    const me = user();
    const later = statusChanged(me, 'accepted');
    const earlier = { ...statusChanged(me, 'ready'), occurredAt: new Date(Date.now() - 60_000).toISOString() };
    await deliver(later);
    await deliver(earlier);
    const kinds = (await http.get('/').set(as(me)).expect(200)).body.items.map((n: { kind: string }) => n.kind);
    expect(kinds).toEqual(['order_accepted', 'order_ready']);
  });

  it('lists my inbox newest first, filters unread and marks entries read', async () => {
    const me = user();
    const other = user();
    const start = Date.now();
    for (const [i, to] of ['accepted', 'ready', 'picked_up'].entries()) {
      await deliver({ ...statusChanged(me, to), occurredAt: new Date(start + i * 1000).toISOString() });
    }
    await deliver(statusChanged(other, 'accepted'));

    const all = (await http.get('/').set(as(me)).expect(200)).body;
    expect(all.items.map((n: { kind: string }) => n.kind)).toEqual([
      'order_picked_up',
      'order_ready',
      'order_accepted',
    ]);
    expect(all.unreadCount).toBe(3);

    const page = (await http.get('/?limit=2').set(as(me)).expect(200)).body;
    expect(page).toMatchObject({ hasMore: true, limit: 2 });

    const newest = all.items[0].id;
    await http.post(`/${newest}/read`).set(as(me)).expect(204);
    await http.post(`/${newest}/read`).set(as(me)).expect(204); // again: still fine
    await http.post(`/${newest}/read`).set(as(other)).expect(404);
    await http.post(`/${randomUUID()}/read`).set(as(me)).expect(404);
    await http.post('/nope/read').set(as(me)).expect(400);

    const unread = (await http.get('/?unread=true').set(as(me)).expect(200)).body;
    expect(unread.items).toHaveLength(2);
    expect(unread.unreadCount).toBe(2);

    await http.post('/read-all').set(as(me)).expect(204);
    expect((await http.get('/').set(as(me)).expect(200)).body.unreadCount).toBe(0);
    expect((await http.get('/').set(as(other)).expect(200)).body.unreadCount).toBe(1);

    await http.get('/').expect(401);
    await http.get('/?unread=maybe').set(as(me)).expect(400);
  });
});
