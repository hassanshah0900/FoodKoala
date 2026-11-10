import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, desc, eq } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database } from '../db/database';
import { favouriteRestaurants, profiles } from '../db/schema';
import type { Identity } from '../identity/identity';
import { ProfilesService } from '../profiles/profiles.service';
import { RestaurantDirectory, type Restaurant } from './restaurant-directory';

/** API shape of Favourite in the contract. */
export interface Favourite {
  restaurantId: string;
  addedAt: Date;
  restaurant: Restaurant | null;
}

@Injectable()
export class FavouritesService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly profiles: ProfilesService,
    private readonly directory: RestaurantDirectory,
  ) {}

  async list(me: Identity): Promise<Favourite[]> {
    const rows = await this.db
      .select({ restaurantId: favouriteRestaurants.restaurantId, addedAt: favouriteRestaurants.addedAt })
      .from(favouriteRestaurants)
      .where(eq(favouriteRestaurants.userId, me.userId))
      .orderBy(desc(favouriteRestaurants.addedAt), desc(favouriteRestaurants.restaurantId));
    const restaurants = await Promise.all(rows.map((r) => this.directory.find(r.restaurantId)));
    return rows.map((r, i) => ({ ...r, restaurant: restaurants[i] }));
  }

  async add(me: Identity, restaurantId: string): Promise<void> {
    if (!(await this.directory.find(restaurantId))) throw new NotFoundException('Restaurant not found');
    await this.profiles.getOrCreate(me);
    await this.db.transaction(async (tx) => {
      // Serialises one user's changes, so the limit holds under concurrency.
      await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, me.userId)).for('update');
      const [already] = await tx
        .select({ restaurantId: favouriteRestaurants.restaurantId })
        .from(favouriteRestaurants)
        .where(and(eq(favouriteRestaurants.userId, me.userId), eq(favouriteRestaurants.restaurantId, restaurantId)));
      if (already) return;
      const [{ total }] = await tx
        .select({ total: count() })
        .from(favouriteRestaurants)
        .where(eq(favouriteRestaurants.userId, me.userId));
      if (total >= this.config.MAX_FAVOURITES_PER_USER) {
        throw new ConflictException(
          `You can have up to ${this.config.MAX_FAVOURITES_PER_USER} favourites; remove one first`,
        );
      }
      await tx.insert(favouriteRestaurants).values({ userId: me.userId, restaurantId });
    });
  }

  async remove(me: Identity, restaurantId: string): Promise<void> {
    await this.db
      .delete(favouriteRestaurants)
      .where(and(eq(favouriteRestaurants.userId, me.userId), eq(favouriteRestaurants.restaurantId, restaurantId)));
  }
}
