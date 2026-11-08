import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { CartClient, RestaurantClient, UserClient } from './clients/clients';
import { HealthController } from './health/health.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';

@Module({
  imports: [
    ConfigModule,
    DrizzleModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ drizzle, connection: config.DATABASE_URL }),
    }),
  ],
  controllers: [HealthController, OrdersController],
  providers: [OrdersService, CartClient, UserClient, RestaurantClient],
})
export class AppModule {}
