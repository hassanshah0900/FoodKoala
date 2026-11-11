import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { LineOption } from '../db/schema';
import type { Identity } from '../identity/identity';
import { call, UnavailableService } from './http';

/** GET / of cart-service (Cart in contracts/openapi/cart-service.yaml). */
export interface Cart {
  restaurantId: string | null;
  lines: {
    id: string;
    itemId: string;
    name: string;
    quantity: number;
    options: LineOption[];
    note: string | null;
    unitPricePaisa: number;
    lineTotalPaisa: number;
  }[];
  subtotalPaisa: number;
  problems: { lineId: string | null; message: string }[];
}

/** Address in contracts/openapi/user-service.yaml. */
export interface Address {
  id: string;
  label: string;
  labelText: string | null;
  line1: string;
  area: string;
  city: string;
  landmark: string | null;
  instructions: string | null;
  location: { lat: number; lng: number };
}

/** The parts of Restaurant / ManagedRestaurant in contracts/openapi/restaurant-service.yaml we use. */
export interface Restaurant {
  id: string;
  name: string;
  location: { lat: number; lng: number };
  /** Only present when the caller owns the restaurant or is an admin. */
  ownerId?: string;
}

/** DeliveryQuote in contracts/openapi/restaurant-service.yaml. */
export interface DeliveryQuote {
  deliverable: boolean;
  acceptingOrders: boolean;
  distanceMeters: number;
  delivery: { zoneId: string; deliveryFeePaisa: number; minimumOrderPaisa: number; deliveryTimeMinutes: number } | null;
}

/** An answer we don't expect means a bug on one side; fail closed like an outage. */
const unexpected = (service: string, status: number) =>
  new UnavailableService(service, `answered ${status} unexpectedly`);

@Injectable()
export class CartClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async get(me: Identity): Promise<Cart> {
    const res = await call<Cart>('cart-service', this.config.CART_SERVICE_URL, '', this.opts(me));
    if (res.status !== 200) throw unexpected('cart-service', res.status);
    return res.body;
  }

  async clear(me: Identity): Promise<void> {
    const res = await call('cart-service', this.config.CART_SERVICE_URL, '', { ...this.opts(me), method: 'DELETE' });
    if (res.status !== 204) throw unexpected('cart-service', res.status);
  }

  private opts(me: Identity) {
    return { as: me, timeoutMs: this.config.SERVICE_TIMEOUT_MS };
  }
}

@Injectable()
export class UserClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** One of the caller's saved addresses, or null when it is not theirs or doesn't exist. */
  async address(me: Identity, id: string): Promise<Address | null> {
    const res = await call<Address>(
      'user-service',
      this.config.USER_SERVICE_URL,
      `me/addresses/${encodeURIComponent(id)}`,
      {
        as: me,
        timeoutMs: this.config.SERVICE_TIMEOUT_MS,
      },
    );
    if (res.status === 404) return null;
    if (res.status !== 200) throw unexpected('user-service', res.status);
    return res.body;
  }
}

@Injectable()
export class RestaurantClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /**
   * The restaurant as `as` sees it: anonymous callers only see approved ones,
   * owners and admins see theirs in any status, with `ownerId`. Null when not visible.
   */
  async get(id: string, as?: Identity): Promise<Restaurant | null> {
    const res = await call<Restaurant>(
      'restaurant-service',
      this.config.RESTAURANT_SERVICE_URL,
      encodeURIComponent(id),
      {
        as,
        timeoutMs: this.config.SERVICE_TIMEOUT_MS,
      },
    );
    if (res.status === 404) return null;
    if (res.status !== 200) throw unexpected('restaurant-service', res.status);
    return res.body;
  }

  /**
   * Whether an approved restaurant delivers to a point, and takes orders `when` (now if absent);
   * null when it isn't approved (any more).
   */
  async quote(id: string, at: { lat: number; lng: number }, when?: Date): Promise<DeliveryQuote | null> {
    const res = await call<DeliveryQuote>(
      'restaurant-service',
      this.config.RESTAURANT_SERVICE_URL,
      `${encodeURIComponent(id)}/delivery-quote`,
      { query: when ? { ...at, at: when.toISOString() } : at, timeoutMs: this.config.SERVICE_TIMEOUT_MS },
    );
    if (res.status === 404) return null;
    if (res.status !== 200) throw unexpected('restaurant-service', res.status);
    return res.body;
  }

  /** Whether `me` owns the restaurant (ADR 0006): null when it doesn't exist for them. */
  async isOwner(me: Identity, id: string): Promise<boolean | null> {
    const restaurant = await this.get(id, me);
    return restaurant === null ? null : restaurant.ownerId === me.userId;
  }
}
