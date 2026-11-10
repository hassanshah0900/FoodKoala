import { z } from 'zod';
import { DISCOUNT_KINDS } from '../db/schema';
import { text } from '../orders/orders.dto';
import { normaliseCode } from './voucher.rules';

export const voucherCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,32}$/, 'A voucher code is 3 to 32 letters, digits, - or _')
  .transform(normaliseCode);

const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const paisa = z.int().positive();

// Shapes match VoucherCreate and VoucherUpdate in contracts/openapi/order-service.yaml.
export const voucherCreateSchema = z
  .strictObject({
    code: voucherCodeSchema,
    description: text(200),
    kind: z.enum(DISCOUNT_KINDS),
    value: z.int().positive(),
    maxDiscountPaisa: paisa.nullable().default(null),
    minSubtotalPaisa: z.int().min(0).default(0),
    restaurantId: z.uuid().nullable().default(null),
    firstOrderOnly: z.boolean().default(false),
    usageLimit: z.int().positive().nullable().default(null),
    perCustomerLimit: z.int().positive().default(1),
    startsAt: instant,
    endsAt: instant,
  })
  .refine((v) => v.kind !== 'percent' || v.value <= 100, { path: ['value'], message: 'At most 100 percent' })
  .refine((v) => v.kind === 'percent' || v.maxDiscountPaisa === null, {
    path: ['maxDiscountPaisa'],
    message: 'Only a percent discount has a cap',
  })
  .refine((v) => v.endsAt > v.startsAt, { path: ['endsAt'], message: 'Must be after startsAt' });
export type VoucherCreateDto = z.output<typeof voucherCreateSchema>;

export const voucherUpdateSchema = z
  .strictObject({
    description: text(200),
    usageLimit: z.int().positive().nullable(),
    endsAt: instant,
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to change');
export type VoucherUpdateDto = z.output<typeof voucherUpdateSchema>;
