import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { CartClient, RestaurantClient, UserClient } from './clients/clients';
import { DeliveryEventConsumer } from './delivery/delivery-event-consumer';
import { HealthController } from './health/health.controller';
import { AcceptTimeouts } from './orders/accept-timeouts';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { OutboxRelay } from './outbox/outbox-relay';
import { EVENT_PUBLISHER, KafkaPublisher } from './outbox/publisher';

@Module({
  imports: [
    ConfigModule,
    DrizzleModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ drizzle, connection: config.DATABASE_URL }),
    }),
  ],
  controllers: [HealthController, OrdersController],
  providers: [
    OrdersService,
    AcceptTimeouts,
    CartClient,
    UserClient,
    RestaurantClient,
    OutboxRelay,
    DeliveryEventConsumer,
    {
      provide: EVENT_PUBLISHER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.KAFKA_BROKERS ? new KafkaPublisher(config.KAFKA_BROKERS, config.KAFKA_CLIENT_ID) : null,
    },
  ],
})
export class AppModule {}
