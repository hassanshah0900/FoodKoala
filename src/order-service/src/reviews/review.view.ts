import type { ReviewRow } from '../db/schema';

/** Review in contracts/openapi/order-service.yaml. */
export interface Review {
  orderId: string;
  restaurantId: string;
  riderId: string | null;
  restaurantRating: number;
  riderRating: number | null;
  comment: string | null;
  createdAt: Date;
}

export const toReview = ({ customerId: _customerId, ...review }: ReviewRow): Review => review;
