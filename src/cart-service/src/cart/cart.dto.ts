import { z } from 'zod';

// Shapes match AddLine / UpdateLine in contracts/openapi/cart-service.yaml.

const optionIds = z
  .array(z.uuid())
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, 'optionIds repeat');
const quantity = z.int().min(1).max(50);
const note = z.string().trim().min(1).max(200).nullable();

export const addLineSchema = z.strictObject({
  restaurantId: z.uuid(),
  itemId: z.uuid(),
  quantity,
  optionIds: optionIds.default([]),
  note: note.default(null),
  replace: z.boolean().default(false),
});
export type AddLineDto = z.output<typeof addLineSchema>;

export const updateLineSchema = z
  .strictObject({ quantity, optionIds, note })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'send at least one field');
export type UpdateLineDto = z.output<typeof updateLineSchema>;

export const lineIdSchema = z.uuid();
