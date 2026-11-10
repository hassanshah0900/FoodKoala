import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { type Identity, isAdmin } from '../identity/identity';

/**
 * Asks restaurant-service whether the caller may manage a restaurant (ADR 0006).
 * It only returns `ownerId` to the owner and admins, so the answer is in the response.
 * Fails closed: if restaurant-service can't answer, the change is refused with 503.
 */
@Injectable()
export class RestaurantAccess {
  private readonly logger = new Logger(RestaurantAccess.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async assertCanManage(me: Identity, restaurantId: string): Promise<void> {
    const url = new URL(encodeURIComponent(restaurantId), this.config.RESTAURANT_SERVICE_URL.replace(/\/?$/, '/'));
    let body: { ownerId?: unknown };
    try {
      const res = await fetch(url, {
        headers: {
          'X-User-Id': me.userId,
          'X-User-Phone': me.phone,
          'X-User-Roles': me.roles.join(','),
        },
        signal: AbortSignal.timeout(this.config.RESTAURANT_SERVICE_TIMEOUT_MS),
      });
      if (res.status === 404) throw new NotFoundException('Restaurant not found');
      if (!res.ok) throw new Error(`restaurant-service answered ${res.status}`);
      body = (await res.json()) as { ownerId?: unknown };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Ownership check for restaurant ${restaurantId} failed: ${String(err)}`);
      throw new ServiceUnavailableException('Could not check who owns the restaurant; try again');
    }
    if (body.ownerId !== me.userId && !isAdmin(me)) throw new ForbiddenException('Not your restaurant');
  }
}
