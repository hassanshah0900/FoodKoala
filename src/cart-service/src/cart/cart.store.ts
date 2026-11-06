import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { PricedOption } from '../menu/menu-client';
import { REDIS } from '../redis/redis.module';

/** A cart line as stored, with what menu-service last said about it. */
export interface StoredLine {
  id: string;
  itemId: string;
  quantity: number;
  /** Sorted, so equal choices compare equal. */
  optionIds: string[];
  note: string | null;
  last: { name: string; options: PricedOption[]; unitPricePaisa: number };
}

export interface StoredCart {
  restaurantId: string;
  lines: StoredLine[];
  updatedAt: string;
}

/**
 * Writes `next` only if the cart is still `expected` (both JSON strings,
 * '' for no cart); an empty `next` deletes it. Atomic in Redis.
 */
const COMPARE_AND_SET = `
local current = redis.call('GET', KEYS[1]) or ''
if current ~= ARGV[1] then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) end
return 1`;

const MAX_ATTEMPTS = 10;

@Injectable()
export class CartStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private key(userId: string): string {
    return `cart:${userId}`;
  }

  async get(userId: string): Promise<StoredCart | null> {
    const raw = await this.redis.get(this.key(userId));
    return raw ? (JSON.parse(raw) as StoredCart) : null;
  }

  /**
   * Read-modify-write without lost updates: `change` gets the current cart
   * and returns the new one (null to delete); on a concurrent change it runs again.
   */
  async update(userId: string, change: (cart: StoredCart | null) => StoredCart | null): Promise<StoredCart | null> {
    const key = this.key(userId);
    const ttl = this.config.CART_TTL_DAYS * 24 * 60 * 60;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const raw = (await this.redis.get(key)) ?? '';
      const next = change(raw ? (JSON.parse(raw) as StoredCart) : null);
      const written = await this.redis.eval(COMPARE_AND_SET, 1, key, raw, next ? JSON.stringify(next) : '', ttl);
      if (written === 1) return next;
    }
    throw new ConflictException('Your cart is changing too fast; try again');
  }

  async clear(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }
}
