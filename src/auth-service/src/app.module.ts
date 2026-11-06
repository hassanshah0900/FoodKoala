import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// TODO(auth): OTP request/verify, JWT issuing and refresh.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
