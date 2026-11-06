import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// TODO(restaurant): Restaurant CRUD, zones and opening hours.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
