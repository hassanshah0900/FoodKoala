import { Module } from '@nestjs/common';
import { CartController } from './cart/cart.controller';
import { CartService } from './cart/cart.service';
import { CartStore } from './cart/cart.store';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { MenuClient } from './menu/menu-client';
import { OrderClient } from './orders/order-client';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule],
  // HealthController first: its routes must not be taken by the cart's.
  controllers: [HealthController, CartController],
  providers: [CartService, CartStore, MenuClient, OrderClient],
})
export class AppModule {}
