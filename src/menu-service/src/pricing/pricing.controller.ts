import { Body, Controller, HttpCode, HttpStatus, Param, Post, UnprocessableEntityException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/database';
import { items } from '../db/schema';
import { idSchema } from '../menu/menu.dto';
import { priceLines, priceRequestSchema, type PriceRequest } from './pricing';

/** Public: the only place order lines get their prices (cart and order services call it). */
@Controller('restaurants/:restaurantId/price')
export class PricingController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async price(
    @Param('restaurantId', { schema: idSchema }) restaurantId: string,
    @Body({ schema: priceRequestSchema }) body: PriceRequest,
  ) {
    const itemIds = [...new Set(body.lines.map((l) => l.itemId))];
    const rows = await this.db
      .select()
      .from(items)
      .where(and(eq(items.restaurantId, restaurantId), inArray(items.id, itemIds)));

    const result = priceLines(restaurantId, body, new Map(rows.map((r) => [r.id, r])));
    if (!result.ok) throw new UnprocessableEntityException(result.problems);
    return result.value;
  }
}
