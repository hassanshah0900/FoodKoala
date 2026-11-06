import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule],
  controllers: [HealthController],
})
export class AppModule {}
