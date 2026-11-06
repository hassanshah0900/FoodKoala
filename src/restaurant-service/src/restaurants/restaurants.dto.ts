import { z } from 'zod';
import { PROVINCES, STATUSES } from '../db/schema';
import { locationSchema } from '../geo/geo';

// Shapes match RestaurantCreate / RestaurantUpdate / StatusChange in contracts/openapi/restaurant-service.yaml.

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const httpsUrl = z.url({ protocol: /^https$/, error: 'use an https:// URL' });

const fields = {
  name: text(2, 100),
  description: text(1, 500).nullable(),
  cuisines: z
    .array(z.string().regex(/^[a-z][a-z-]{1,29}$/, 'use lowercase tags like fast-food'))
    .min(1)
    .max(5)
    .refine((c) => new Set(c).size === c.length, 'cuisines repeat'),
  phone: z.string().regex(/^\+92\d{9,10}$/, 'use E.164, e.g. +922134567890'),
  address: z.strictObject({
    line1: text(1, 200),
    area: text(1, 100),
    city: text(1, 60),
    province: z.enum(PROVINCES),
  }),
  location: locationSchema,
  logoUrl: httpsUrl.nullable(),
  coverUrl: httpsUrl.nullable(),
};

export const restaurantCreateSchema = z.strictObject({
  ...fields,
  description: fields.description.optional(),
  logoUrl: fields.logoUrl.optional(),
  coverUrl: fields.coverUrl.optional(),
});
export type RestaurantCreateDto = z.output<typeof restaurantCreateSchema>;

export const restaurantUpdateSchema = z
  .strictObject(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'send at least one field');
export type RestaurantUpdateDto = z.output<typeof restaurantUpdateSchema>;

export const statusChangeSchema = z.strictObject({ status: z.enum(STATUSES), reason: text(1, 500).optional() });
export type StatusChangeDto = z.output<typeof statusChangeSchema>;

export const pauseSchema = z.strictObject({ minutes: z.int().min(5).max(1440) });

export const idSchema = z.uuid();

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PageQuery = z.output<typeof pageQuerySchema>;

export const reviewQuerySchema = pageQuerySchema.extend({ status: z.enum(STATUSES).default('pending') });
export type ReviewQuery = z.output<typeof reviewQuerySchema>;
