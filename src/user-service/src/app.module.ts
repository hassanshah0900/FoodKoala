import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// TODO(user): Profile and address CRUD.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
