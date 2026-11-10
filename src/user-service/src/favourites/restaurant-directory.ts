import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';

/** Restaurant of restaurant-service.yaml, passed through as it is. */
export type Restaurant = Record<string, unknown> & { id: string };

/**
 * Looks restaurants up in restaurant-service as an anonymous caller, so only
 * restaurants listed to customers (approved) are found. Fails closed: when
 * restaurant-service can't answer, the request gets 503.
 */
@Injectable()
export class RestaurantDirectory {
  private readonly logger = new Logger(RestaurantDirectory.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** The listed restaurant, or null when there is none with this id. */
  async find(id: string): Promise<Restaurant | null> {
    const url = new URL(encodeURIComponent(id), this.config.RESTAURANT_SERVICE_URL.replace(/\/?$/, '/'));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(this.config.RESTAURANT_SERVICE_TIMEOUT_MS) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`restaurant-service answered ${res.status}`);
      return (await res.json()) as Restaurant;
    } catch (err) {
      this.logger.error(`Looking up restaurant ${id} failed: ${String(err)}`);
      throw new ServiceUnavailableException('Could not reach the restaurant directory; try again');
    }
  }
}
