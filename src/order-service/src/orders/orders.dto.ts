import { z } from 'zod';
import { PAYMENT_METHODS, STATUSES } from '../db/schema';

/** Trimmed, non-empty text of at most `max` characters. */
export const text = (max: number) => z.string().trim().min(1).max(max);

export const idSchema = z.uuid();

/** Header value: one random key per checkout attempt, reused on retries. */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Idempotency-Key must be 8 to 64 letters, digits, - or _');

/** Rs 1,000. */
export const MAX_TIP_PAISA = 100_000;

export const checkoutSchema = z.strictObject({
  addressId: z.uuid(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  note: text(500).nullable().default(null),
  /** Checked against the vouchers at checkout; a bad code fails it with 422. */
  voucherCode: z.string().trim().min(1).max(32).nullable().default(null),
  /** For the rider, added to the total. */
  tipPaisa: z.int().min(0).max(MAX_TIP_PAISA).default(0),
});
export type CheckoutDto = z.output<typeof checkoutSchema>;

export const statusChangeSchema = z.strictObject({
  status: z.enum(STATUSES),
  reason: text(500).optional(),
  prepTimeMinutes: z.int().min(5).max(120).optional(),
});
export type StatusChangeDto = z.output<typeof statusChangeSchema>;

/** `?code=950C29C4` (a leading # and any case are fine), as 8 lower-case hex digits. */
export const codeQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .transform((c) => c.replace(/^#/, '').toLowerCase())
    .pipe(z.string().regex(/^[0-9a-f]{8}$/, 'An order code is 8 letters and digits, like 950C29C4')),
});
export type CodeQuery = z.output<typeof codeQuerySchema>;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PageQuery = z.output<typeof pageQuerySchema>;

export const restaurantOrdersQuerySchema = pageQuerySchema.extend({
  /** `placed,accepted,ready`: comma separated, no duplicates needed. */
  status: z
    .string()
    .transform((s) => [
      ...new Set(
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.enum(STATUSES)).min(1))
    .optional(),
});
export type RestaurantOrdersQuery = z.output<typeof restaurantOrdersQuerySchema>;
