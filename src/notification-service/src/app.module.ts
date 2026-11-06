import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// TODO(notification): Kafka consumers and notification channels.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
