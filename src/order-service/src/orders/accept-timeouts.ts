import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { OrdersService, REJECT_BATCH } from './orders.service';

/**
 * Rejects orders the restaurant leaves unanswered for ACCEPT_TIMEOUT_MINUTES,
 * so a customer is never left waiting on a kitchen that isn't looking. Every
 * replica runs it; the row locks keep them from rejecting an order twice.
 */
@Injectable()
export class AcceptTimeouts implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AcceptTimeouts.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly orders: OrdersService,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** One round: rejects every overdue order, a batch at a time. Returns how many. */
  async runOnce(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.config.ACCEPT_TIMEOUT_MINUTES * 60_000);
    let total = 0;
    for (;;) {
      const ids = await this.orders.rejectUnanswered(cutoff, now);
      total += ids.length;
      if (ids.length) this.logger.log(`Rejected ${ids.length} order(s) not accepted in time: ${ids.join(', ')}`);
      if (ids.length < REJECT_BATCH || this.stopped) return total;
    }
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .then(() => undefined)
        .catch((err: unknown) => this.logger.error(`Rejecting unanswered orders failed: ${String(err)}`))
        .finally(() => this.schedule());
    }, this.config.ACCEPT_CHECK_MS);
  }
}
