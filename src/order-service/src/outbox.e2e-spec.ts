import { randomUUID } from 'node:crypto';
import { inArray, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { loadConfig } from './config/config';
import { outbox } from './db/schema';
import { OutboxRelay } from './outbox/outbox-relay';
import type { EventPublisher, OutgoingEvent } from './outbox/publisher';

/** Records what it was given; fails while `down` is set. */
class FakePublisher implements EventPublisher {
  sent: OutgoingEvent[] = [];
  down = false;
  connect = vi.fn(async () => undefined);
  disconnect = vi.fn(async () => undefined);
  async publish(events: OutgoingEvent[]) {
    await new Promise((r) => setTimeout(r, 20));
    if (this.down) throw new Error('broker unavailable');
    this.sent.push(...events);
  }
}

describe('outbox relay (e2e)', () => {
  const config = { ...loadConfig(), OUTBOX_BATCH_SIZE: 3, OUTBOX_POLL_MS: 10, OUTBOX_RETENTION_DAYS: 7 };
  let db: ReturnType<typeof drizzle<Record<string, never>>>;
  const ids: number[] = [];

  const write = async (n: number, key = randomUUID()) => {
    const rows = await db
      .insert(outbox)
      .values(
        Array.from({ length: n }, (_, i) => {
          const eventId = randomUUID();
          return { eventId, topic: 'order.status_changed', key, payload: { id: eventId, seq: i } };
        }),
      )
      .returning();
    ids.push(...rows.map((r) => r.id));
    return rows;
  };

  beforeAll(async () => {
    db = drizzle(process.env.DATABASE_URL!);
    // Start from an empty queue: leftovers of other runs would be sent first.
    await db.update(outbox).set({ publishedAt: new Date() }).where(isNull(outbox.publishedAt));
  });

  afterAll(async () => {
    if (ids.length) await db.delete(outbox).where(inArray(outbox.id, ids));
    await db.$client.end();
  });

  it('sends events oldest first in batches, with the envelope id as a header, and marks them published', async () => {
    const pub = new FakePublisher();
    const relay = new OutboxRelay(db, config, pub);
    const rows = await write(5);

    expect(await relay.publishBatch()).toBe(3);
    expect(await relay.publishBatch()).toBe(2);
    expect(await relay.publishBatch()).toBe(0);

    expect(pub.sent.map((e) => JSON.parse(e.value).seq)).toEqual([0, 1, 2, 3, 4]);
    expect(pub.sent[0]).toEqual({
      topic: 'order.status_changed',
      key: rows[0].key,
      value: JSON.stringify(rows[0].payload),
      headers: { 'event-id': rows[0].eventId, 'event-type': 'order.status_changed' },
    });
    const left = await db
      .select()
      .from(outbox)
      .where(
        inArray(
          outbox.id,
          rows.map((r) => r.id),
        ),
      );
    expect(left.every((r) => r.publishedAt !== null)).toBe(true);
  });

  it('keeps events unpublished when the broker refuses them, and sends them later', async () => {
    const pub = new FakePublisher();
    const relay = new OutboxRelay(db, config, pub);
    await write(2);

    pub.down = true;
    await expect(relay.publishBatch()).rejects.toThrow('broker unavailable');
    expect(await db.select().from(outbox).where(isNull(outbox.publishedAt))).toHaveLength(2);

    pub.down = false;
    expect(await relay.publishBatch()).toBe(2);
    expect(pub.sent).toHaveLength(2);
  });

  it('lets only one of two relays send at a time, so nothing is sent twice', async () => {
    const a = new FakePublisher();
    const b = new FakePublisher();
    const relays = [new OutboxRelay(db, config, a), new OutboxRelay(db, config, b)];
    await write(3);

    const counts = await Promise.all(relays.map((r) => r.publishBatch()));
    expect(counts.sort()).toEqual([0, 3]);
    expect(a.sent.length + b.sent.length).toBe(3);
  });

  it('drains the outbox on its own once started, and stops cleanly', async () => {
    const pub = new FakePublisher();
    const relay = new OutboxRelay(db, config, pub);
    await write(7);

    relay.onApplicationBootstrap();
    await vi.waitFor(() => expect(pub.sent).toHaveLength(7), { timeout: 3000 });
    await relay.onApplicationShutdown();
    expect(pub.connect).toHaveBeenCalledOnce();
    expect(pub.disconnect).toHaveBeenCalledOnce();
  });

  it('retries with back-off after a failure', async () => {
    const pub = new FakePublisher();
    const relay = new OutboxRelay(db, config, pub);
    await write(1);

    pub.down = true;
    relay.onApplicationBootstrap();
    await new Promise((r) => setTimeout(r, 100));
    pub.down = false;
    await vi.waitFor(() => expect(pub.sent).toHaveLength(1), { timeout: 3000 });
    await relay.onApplicationShutdown();
  });

  it('purges only published events past the retention', async () => {
    const relay = new OutboxRelay(db, config, new FakePublisher());
    const [old, recent, pending] = await write(3);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600_000);
    await db
      .update(outbox)
      .set({ publishedAt: tenDaysAgo })
      .where(inArray(outbox.id, [old.id]));
    await db
      .update(outbox)
      .set({ publishedAt: new Date() })
      .where(inArray(outbox.id, [recent.id]));

    expect(await relay.purge()).toBeGreaterThanOrEqual(1);
    const left = (
      await db
        .select()
        .from(outbox)
        .where(inArray(outbox.id, [old.id, recent.id, pending.id]))
    )
      .map((r) => r.id)
      .sort((a, b) => a - b);
    expect(left).toEqual([recent.id, pending.id]);
  });

  it('does nothing without Kafka configured', async () => {
    const relay = new OutboxRelay(db, config, null);
    await write(1);
    relay.onApplicationBootstrap();
    expect(await relay.publishBatch()).toBe(0);
    await relay.onApplicationShutdown();
  });
});
