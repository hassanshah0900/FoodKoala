import { z } from 'zod';

export const ORDER_REVIEWED = 'order.reviewed';

/** contracts/events/order.reviewed.schema.json, the fields this service keeps. */
export const orderReviewedSchema = z.object({
  id: z.uuid(),
  type: z.literal(ORDER_REVIEWED),
  data: z.object({
    orderId: z.uuid(),
    restaurantId: z.uuid(),
    restaurantRating: z.int().min(1).max(5),
    comment: z.string().nullable(),
    reviewedAt: z.iso.datetime({ offset: true }),
  }),
});
export type OrderReviewed = z.infer<typeof orderReviewedSchema>['data'];
