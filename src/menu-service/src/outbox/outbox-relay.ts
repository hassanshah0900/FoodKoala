import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database } from '../db/database';
import { outbox } from '../db/schema';
import { EVENT_PUBLISHER, type EventPublisher } from './publisher';

const PURGE_EVERY_MS = 60 * 60_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Publishes the outbox to Kafka (ADR 0007), oldest first. One relay at a time
 * holds a transaction-scoped advisory lock, so with several replicas events
 * still leave in the order they were written. A row is marked published only
 * after the broker acknowledged it; a crash in between sends it again, so
 * delivery is at least once and consumers dedupe on the envelope id.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;
  private failures = 0;
  private lastPurge = 0;
  private connected = false;

  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher | null,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.publisher) {
      this.logger.warn('KAFKA_BROKERS is not set: events stay in menu.outbox until a relay with Kafka runs');
      return;
    }
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
    await this.publisher?.disconnect().catch(() => undefined);
  }

  /**
   * Sends one batch. Returns how many events left, or 0 when there was nothing
   * to send or another relay holds the lock. Throws when Kafka refused them;
   * the rows then stay unpublished.
   */
  async publishBatch(): Promise<number> {
    if (!this.publisher) return 0;
    const publisher = this.publisher;
    return this.db.transaction(async (tx) => {
      const lock = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended('menu.outbox', 0)) as locked`,
      );
      if (!lock.rows[0]?.locked) return 0;

      const rows = await tx
        .select()
        .from(outbox)
        .where(isNull(outbox.publishedAt))
        .orderBy(asc(outbox.id))
        .limit(this.config.OUTBOX_BATCH_SIZE);
      if (!rows.length) return 0;

      await publisher.publish(
        rows.map((r) => ({
          topic: r.topic,
          key: r.key,
          value: JSON.stringify(r.payload),
          headers: { 'event-id': r.eventId, 'event-type': r.topic },
        })),
      );
      await tx
        .update(outbox)
        .set({ publishedAt: new Date() })
        .where(
          inArray(
            outbox.id,
            rows.map((r) => r.id),
          ),
        );
      return rows.length;
    });
  }

  /** Deletes published events older than the retention; Kafka keeps its own copy. */
  async purge(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - this.config.OUTBOX_RETENTION_DAYS * 24 * 3600_000);
    const deleted = await this.db
      .delete(outbox)
      .where(and(isNotNull(outbox.publishedAt), lt(outbox.publishedAt, before)))
      .returning({ id: outbox.id });
    return deleted.length;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick().finally(() => (this.running = undefined));
    }, delayMs);
  }

  private async tick(): Promise<void> {
    let next = this.config.OUTBOX_POLL_MS;
    try {
      await this.connect();
      const sent = await this.publishBatch();
      if (sent === this.config.OUTBOX_BATCH_SIZE) next = 0; // more waiting: keep going
      if (this.failures > 0) this.logger.log(`Publishing again after ${this.failures} failed attempts`);
      this.failures = 0;
      if (Date.now() - this.lastPurge > PURGE_EVERY_MS) {
        this.lastPurge = Date.now();
        const purged = await this.purge();
        if (purged) this.logger.log(`Purged ${purged} published events`);
      }
    } catch (err) {
      this.failures++;
      next = Math.min(this.config.OUTBOX_POLL_MS * 2 ** this.failures, MAX_BACKOFF_MS);
      this.logger.error(
        `Publishing the outbox failed (attempt ${this.failures}), retrying in ${next} ms: ${String(err)}`,
      );
    }
    this.schedule(next);
  }

  private async connect(): Promise<void> {
    if (this.connected) return;
    await this.publisher!.connect();
    this.connected = true;
  }
}
