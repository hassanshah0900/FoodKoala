import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AddressesController } from './addresses/addresses.controller';
import { AddressesService } from './addresses/addresses.service';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { FavouritesController } from './favourites/favourites.controller';
import { FavouritesService } from './favourites/favourites.service';
import { RestaurantDirectory } from './favourites/restaurant-directory';
import { HealthController } from './health/health.controller';
import { ProfilesController } from './profiles/profiles.controller';
import { ProfilesService } from './profiles/profiles.service';

@Module({
  imports: [
    ConfigModule,
    DrizzleModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ drizzle, connection: config.DATABASE_URL }),
    }),
  ],
  controllers: [HealthController, ProfilesController, AddressesController, FavouritesController],
  providers: [ProfilesService, AddressesService, FavouritesService, RestaurantDirectory],
})
export class AppModule {}
