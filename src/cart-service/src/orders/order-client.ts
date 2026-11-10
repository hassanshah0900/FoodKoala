import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Identity } from '../identity/identity';

/** What reordering needs of an Order (contracts/openapi/order-service.yaml). */
export interface PastOrder {
  restaurantId: string;
  lines: { itemId: string; name: string; quantity: number; optionIds: string[]; note: string | null }[];
}

interface OrderBody {
  restaurant: { id: string };
  lines: { itemId: string; name: string; quantity: number; options: { id: string }[]; note: string | null }[];
}

/**
 * Reads the caller's orders from order-service, passing their identity on:
 * order-service decides whose order it is (404 for anyone else's).
 */
@Injectable()
export class OrderClient {
  private readonly logger = new Logger(OrderClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async get(me: Identity, orderId: string): Promise<PastOrder> {
    const url = new URL(encodeURIComponent(orderId), this.config.ORDER_SERVICE_URL.replace(/\/?$/, '/'));
    let body: OrderBody;
    try {
      const res = await fetch(url, {
        headers: { 'X-User-Id': me.userId, 'X-User-Phone': me.phone, 'X-User-Roles': me.roles.join(',') },
        signal: AbortSignal.timeout(this.config.ORDER_SERVICE_TIMEOUT_MS),
      });
      if (res.status === 404 || res.status === 403) throw new NotFoundException('Order not found');
      if (!res.ok) throw new Error(`order-service answered ${res.status}`);
      body = (await res.json()) as OrderBody;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Reading order ${orderId} failed: ${String(err)}`);
      throw new ServiceUnavailableException('Could not read the order; try again');
    }
    return {
      restaurantId: body.restaurant.id,
      lines: body.lines.map((l) => ({
        itemId: l.itemId,
        name: l.name,
        quantity: l.quantity,
        optionIds: l.options.map((o) => o.id),
        note: l.note,
      })),
    };
  }
}
