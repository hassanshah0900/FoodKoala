import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, lte } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database } from '../db/database';
import { smsMessages } from '../db/schema';
import { SMS_SENDER, SmsError, type SmsSender } from './sms-sender';

const BATCH = 20;
const FIRST_RETRY_MS = 30_000;

/** When to try again after `attempts` failures: 30 s, 1 min, 2 min, 4 min... */
export const retryDelayMs = (attempts: number) => FIRST_RETRY_MS * 2 ** (attempts - 1);

/**
 * Sends queued SMS. Rows are claimed with `for update skip locked`, so
 * several replicas share the queue without texting anyone twice. Failures are
 * retried with back-off up to SMS_MAX_ATTEMPTS, except ones the provider says
 * will never work (e.g. an invalid number), which fail at once.
 */
@Injectable()
export class SmsDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SmsDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SMS_SENDER) private readonly sender: SmsSender,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** Sends the messages that are due. Returns how many were tried. */
  async sendDue(now = new Date()): Promise<number> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(smsMessages)
        .where(and(eq(smsMessages.status, 'queued'), lte(smsMessages.nextAttemptAt, now)))
        .orderBy(asc(smsMessages.id))
        .limit(BATCH)
        .for('update', { skipLocked: true });

      for (const sms of due) {
        const attempts = sms.attempts + 1;
        try {
          const providerId = await this.sender.send(sms.phone, sms.body);
          await tx
            .update(smsMessages)
            .set({ status: 'sent', attempts, providerId, sentAt: new Date(), lastError: null })
            .where(eq(smsMessages.id, sms.id));
        } catch (err) {
          const retryable = !(err instanceof SmsError) || err.retryable;
          const giveUp = !retryable || attempts >= this.config.SMS_MAX_ATTEMPTS;
          await tx
            .update(smsMessages)
            .set({
              status: giveUp ? 'failed' : 'queued',
              attempts,
              lastError: String(err instanceof Error ? err.message : err).slice(0, 500),
              nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
            })
            .where(eq(smsMessages.id, sms.id));
          this.logger.warn(
            `SMS ${sms.id} ${giveUp ? 'failed for good' : 'will be retried'} (attempt ${attempts}): ${String(err)}`,
          );
        }
      }
      return due.length;
    });
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick().finally(() => (this.running = undefined));
    }, delayMs);
  }

  private async tick(): Promise<void> {
    let next = this.config.SMS_POLL_MS;
    try {
      if ((await this.sendDue()) === BATCH) next = 0;
    } catch (err) {
      this.logger.error(`Sending SMS failed: ${String(err)}`);
    }
    this.schedule(next);
  }
}
