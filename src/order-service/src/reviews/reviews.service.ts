import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database } from '../db/database';
import { isUniqueViolation } from '../db/errors';
import { orderStatusHistory, outbox, reviews } from '../db/schema';
import type { Identity } from '../identity/identity';
import { orderReviewed } from '../orders/events';
import { OrdersService } from '../orders/orders.service';
import { assertReviewable, deliveryOf } from './review.rules';
import { type Review, toReview } from './review.view';
import type { ReviewCreateDto } from './reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly orders: OrdersService,
  ) {}

  /** The review, for whoever may see the order. */
  async get(me: Identity, orderId: string): Promise<Review> {
    await this.orders.get(me, orderId);
    const [row] = await this.db.select().from(reviews).where(eq(reviews.orderId, orderId));
    if (!row) throw new NotFoundException('This order has not been reviewed');
    return toReview(row);
  }

  /** Saves the customer's review with its order.reviewed event, once per order. */
  async create(me: Identity, orderId: string, dto: ReviewCreateDto): Promise<Review> {
    const order = await this.orders.get(me, orderId);
    const history = await this.db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.id));
    const delivery = deliveryOf(history);
    assertReviewable(order, delivery, {
      reviewerId: me.userId,
      riderRating: dto.riderRating,
      now: new Date(),
      windowDays: this.config.REVIEW_WINDOW_DAYS,
    });

    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(reviews)
          .values({
            orderId,
            customerId: order.customerId,
            restaurantId: order.restaurant.id,
            riderId: delivery.riderId,
            ...dto,
          })
          .returning();
        await tx.insert(outbox).values(orderReviewed(row));
        return toReview(row);
      });
    } catch (err) {
      if (isUniqueViolation(err, 'reviews_pkey')) throw new ConflictException('This order has already been reviewed');
      throw err;
    }
  }
}
