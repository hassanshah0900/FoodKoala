import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { Database } from '../db/database';
import { REDIS } from '../redis/redis.module';

@Controller()
export class HealthController {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readiness() {
    const checks = await Promise.allSettled([this.db.execute(sql`select 1`), this.redis.ping()]);
    const [postgres, redis] = checks.map((c) => (c.status === 'fulfilled' ? 'ok' : 'down'));
    if (postgres !== 'ok' || redis !== 'ok') {
      throw new ServiceUnavailableException({ status: 'unavailable', postgres, redis });
    }
    return { status: 'ok' };
  }
}
