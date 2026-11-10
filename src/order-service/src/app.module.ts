import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { CartClient, RestaurantClient, UserClient } from './clients/clients';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { DeliveryEventConsumer } from './delivery/delivery-event-consumer';
import { HealthController } from './health/health.controller';
import { AcceptTimeouts } from './orders/accept-timeouts';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { OutboxRelay } from './outbox/outbox-relay';
import { EVENT_PUBLISHER, KafkaPublisher } from './outbox/publisher';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { RestaurantAccess } from './restaurants/restaurant-access';
import { ReviewsController } from './reviews/reviews.controller';
import { ReviewsService } from './reviews/reviews.service';
import { VouchersController } from './vouchers/vouchers.controller';
import { VouchersService } from './vouchers/vouchers.service';

@Module({
  imports: [
    ConfigModule,
    DrizzleModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ drizzle, connection: config.DATABASE_URL }),
    }),
  ],
  // VouchersController comes before OrdersController, whose GET /:id would otherwise take GET /vouchers.
  controllers: [HealthController, VouchersController, OrdersController, ReviewsController, ReportsController],
  providers: [
    OrdersService,
    ReviewsService,
    VouchersService,
    ReportsService,
    RestaurantAccess,
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
