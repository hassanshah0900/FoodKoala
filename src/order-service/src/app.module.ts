import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// TODO(order): Order state machine and order.placed event.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
