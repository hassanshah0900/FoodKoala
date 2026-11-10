import { z } from 'zod';
import { text } from '../orders/orders.dto';

const stars = z.int().min(1).max(5);

// Shape matches ReviewCreate in contracts/openapi/order-service.yaml.
export const reviewCreateSchema = z.strictObject({
  restaurantRating: stars,
  riderRating: stars.nullable().default(null),
  comment: text(500).nullable().default(null),
});
export type ReviewCreateDto = z.output<typeof reviewCreateSchema>;
