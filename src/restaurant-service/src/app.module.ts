import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { OutboxRelay } from './outbox/outbox-relay';
import { EVENT_PUBLISHER, KafkaPublisher } from './outbox/publisher';
import { RestaurantsController } from './restaurants/restaurants.controller';
import { RestaurantsService } from './restaurants/restaurants.service';
import { BrowseController, ZonesController } from './zones/zones.controller';
import { ZonesService } from './zones/zones.service';

@Module({
  imports: [
    ConfigModule,
    DrizzleModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ drizzle, connection: config.DATABASE_URL }),
    }),
  ],
  // HealthController first: its static routes must win over `/:id`.
  controllers: [HealthController, RestaurantsController, BrowseController, ZonesController],
  providers: [
    RestaurantsService,
    ZonesService,
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
