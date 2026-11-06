import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

@Controller()
export class HealthController {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readiness() {
    try {
      await this.redis.ping();
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', redis: 'down' });
    }
    return { status: 'ok' };
  }
}
