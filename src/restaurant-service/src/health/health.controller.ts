import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/database';
import { OrderReviewedConsumer } from '../ratings/order-reviewed-consumer';

@Controller()
export class HealthController {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly orderReviewed: OrderReviewedConsumer,
  ) {}

  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readiness() {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', postgres: 'down' });
    }
    if (!this.orderReviewed.healthy) {
      throw new ServiceUnavailableException({ status: 'unavailable', consumer: 'stopped' });
    }
    return { status: 'ok' };
  }
}
