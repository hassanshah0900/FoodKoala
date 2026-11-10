import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { MenuController } from './menu/menu.controller';
import { MenuService } from './menu/menu.service';
import { OutboxRelay } from './outbox/outbox-relay';
import { EVENT_PUBLISHER, KafkaPublisher } from './outbox/publisher';
import { PricingController } from './pricing/pricing.controller';
import { RestaurantAccess } from './restaurants/restaurant-access';

@Module({
  imports: [
    ConfigModule,
    DrizzleModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ drizzle, connection: config.DATABASE_URL }),
    }),
  ],
  controllers: [HealthController, MenuController, PricingController],
  providers: [
    MenuService,
    RestaurantAccess,
    OutboxRelay,
    {
      provide: EVENT_PUBLISHER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.KAFKA_BROKERS ? new KafkaPublisher(config.KAFKA_BROKERS, config.KAFKA_CLIENT_ID) : null,
    },
  ],
})
export class AppModule {}
