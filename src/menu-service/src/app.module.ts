import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// TODO(menu): Menu, item and add-on CRUD.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
