import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/database';
import { orderLines, orders } from '../db/schema';
import { countWhere, sumWhere } from '../db/sql';
import type { Identity } from '../identity/identity';
import { RestaurantAccess } from '../restaurants/restaurant-access';
import type { SalesReport } from './report.view';
import type { ReportQuery } from './reports.dto';

export const REPORT_TIME_ZONE = 'Asia/Karachi';
const TOP_ITEMS = 10;

const isDelivered = eq(orders.status, 'delivered');

@Injectable()
export class ReportsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly access: RestaurantAccess,
  ) {}

  /** Sales of the orders placed in [from, to), for the restaurant's owner or an admin. */
  async sales(me: Identity, restaurantId: string, { from, to }: ReportQuery): Promise<SalesReport> {
    await this.access.assertManages(me, restaurantId);
    const inPeriod = and(eq(orders.restaurantId, restaurantId), gte(orders.placedAt, from), lt(orders.placedAt, to))!;

    const [totals] = await this.db
      .select({
        placed: sql<number>`count(*)`.mapWith(Number),
        delivered: countWhere(isDelivered),
        cancelled: countWhere(eq(orders.status, 'cancelled')),
        rejected: countWhere(eq(orders.status, 'rejected')),
        salesPaisa: sumWhere(orders.subtotalPaisa, isDelivered),
        discountsPaisa: sumWhere(orders.discountPaisa, isDelivered),
        averagePrepMinutes: sql<number | null>`round(avg(${orders.prepTimeMinutes}), 1)`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
      })
      .from(orders)
      .where(inPeriod);

    const quantity = sql<number>`sum(${orderLines.quantity})`.mapWith(Number);
    const topItems = await this.db
      .select({
        itemId: orderLines.itemId,
        // The latest name it was sold under.
        name: sql<string>`(array_agg(${orderLines.name} order by ${orders.placedAt} desc))[1]`,
        quantity,
        salesPaisa: sql<number>`sum(${orderLines.lineTotalPaisa})`.mapWith(Number),
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(and(inPeriod, isDelivered))
      .groupBy(orderLines.itemId)
      .orderBy(desc(quantity), orderLines.itemId)
      .limit(TOP_ITEMS);

    // The zone is inlined, not a parameter: GROUP BY must see the very same expression as SELECT.
    const day = sql<string>`to_char(${orders.placedAt} at time zone ${sql.raw(`'${REPORT_TIME_ZONE}'`)}, 'YYYY-MM-DD')`;
    const days = await this.db
      .select({
        date: day,
        placed: sql<number>`count(*)`.mapWith(Number),
        delivered: countWhere(isDelivered),
        salesPaisa: sumWhere(orders.subtotalPaisa, isDelivered),
      })
      .from(orders)
      .where(inPeriod)
      .groupBy(day)
      .orderBy(day);

    const { averagePrepMinutes, salesPaisa, discountsPaisa, ...counts } = totals;
    return {
      restaurantId,
      from: from.toISOString(),
      to: to.toISOString(),
      timeZone: REPORT_TIME_ZONE,
      orders: counts,
      salesPaisa,
      discountsPaisa,
      averageOrderPaisa: counts.delivered ? Math.round(salesPaisa / counts.delivered) : null,
      averagePrepMinutes,
      topItems,
      days,
    };
  }
}
