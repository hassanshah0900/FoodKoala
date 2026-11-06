import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// TODO(cart): Cart add/update/remove and validation.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
