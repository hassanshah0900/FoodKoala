import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/database';
import { restaurants, reviews } from '../db/schema';
import { recordRestaurantChange } from '../events/restaurant-events';
import type { PageQuery } from '../restaurants/restaurants.dto';
import type { Page } from '../restaurants/restaurants.service';
import type { OrderReviewed } from './order-reviewed';

/** Review in the contract: no order or customer, so comments stay anonymous. */
export interface Review {
  rating: number;
  comment: string | null;
  createdAt: Date;
}

@Injectable()
export class RatingsService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Adds a customer's review to the restaurant's rating, once per order: a
   * redelivered event finds the review already there and changes nothing.
   * Returns false when nothing changed (seen before, or unknown restaurant).
   */
  async record(review: OrderReviewed): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [known] = await tx
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(eq(restaurants.id, review.restaurantId))
        .for('update');
      if (!known) return false;

      const inserted = await tx
        .insert(reviews)
        .values({
          orderId: review.orderId,
          restaurantId: review.restaurantId,
          rating: review.restaurantRating,
          comment: review.comment,
          createdAt: new Date(review.reviewedAt),
        })
        .onConflictDoNothing()
        .returning({ orderId: reviews.orderId });
      if (!inserted.length) return false;

      await tx
        .update(restaurants)
        .set({
          ratingSum: sql`${restaurants.ratingSum} + ${review.restaurantRating}`,
          ratingCount: sql`${restaurants.ratingCount} + 1`,
          updatedAt: sql`${restaurants.updatedAt}`, // a new rating is not an edit by the owner
        })
        .where(eq(restaurants.id, review.restaurantId));
      await recordRestaurantChange(tx, review.restaurantId);
      return true;
    });
  }

  /** Reviews of an approved restaurant, newest first. */
  async list(restaurantId: string, { page, limit }: PageQuery): Promise<Page<Review>> {
    const [listed] = await this.db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(and(eq(restaurants.id, restaurantId), eq(restaurants.status, 'approved')));
    if (!listed) throw new NotFoundException('Restaurant not found');

    const rows = await this.db
      .select({ rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt })
      .from(reviews)
      .where(eq(reviews.restaurantId, restaurantId))
      .orderBy(desc(reviews.createdAt), desc(reviews.orderId))
      .limit(limit + 1)
      .offset((page - 1) * limit);
    return { items: rows.slice(0, limit), page, limit, hasMore: rows.length > limit };
  }
}
