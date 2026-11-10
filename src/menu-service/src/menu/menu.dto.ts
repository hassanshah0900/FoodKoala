import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OptionGroup } from '../db/schema';

// Shapes match the *Create / *Update / OptionGroupInput / Order schemas in contracts/openapi/menu-service.yaml.

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.int().min(0).max(10_000_000);
const httpsUrl = z.url({ protocol: /^https$/, error: 'use an https:// URL' });

export const idSchema = z.uuid();

const unique = (ids: (string | undefined)[]) => {
  const given = ids.filter((id): id is string => id !== undefined);
  return new Set(given).size === given.length;
};

const optionInput = z.strictObject({
  id: z.uuid().optional(),
  name: text(80),
  pricePaisa: money,
  isAvailable: z.boolean().default(true),
});

const optionGroupInput = z
  .strictObject({
    id: z.uuid().optional(),
    name: text(80),
    minSelect: z.int().min(0),
    maxSelect: z.int().min(1),
    options: z.array(optionInput).min(1).max(30),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'minSelect is above maxSelect', path: ['minSelect'] })
  .refine((g) => g.maxSelect <= g.options.length, {
    message: 'maxSelect is above the number of options',
    path: ['maxSelect'],
  });

const optionGroups = z
  .array(optionGroupInput)
  .max(10)
  .refine((groups) => unique(groups.map((g) => g.id)), 'option group ids repeat')
  .refine((groups) => unique(groups.flatMap((g) => g.options.map((o) => o.id))), 'option ids repeat');

/** Gives new groups and options an id; existing ones keep theirs, so carts referencing them stay valid. */
export function withIds(groups: z.output<typeof optionGroups>): OptionGroup[] {
  return groups.map((g) => ({
    id: g.id ?? randomUUID(),
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    options: g.options.map((o) => ({
      id: o.id ?? randomUUID(),
      name: o.name,
      pricePaisa: o.pricePaisa,
      isAvailable: o.isAvailable,
    })),
  }));
}

export const categoryCreateSchema = z.strictObject({ name: text(60), description: text(300).nullable().optional() });
export type CategoryCreateDto = z.output<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z
  .strictObject({ name: text(60), description: text(300).nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'send at least one field');
export type CategoryUpdateDto = z.output<typeof categoryUpdateSchema>;

const itemFields = {
  name: text(100),
  description: text(500).nullable(),
  imageUrl: httpsUrl.nullable(),
  pricePaisa: money,
  isAvailable: z.boolean(),
  optionGroups,
};

export const itemCreateSchema = z.strictObject({
  ...itemFields,
  description: itemFields.description.optional(),
  imageUrl: itemFields.imageUrl.optional(),
  isAvailable: itemFields.isAvailable.default(true),
  optionGroups: optionGroups.default([]),
});
export type ItemCreateDto = z.output<typeof itemCreateSchema>;

export const itemUpdateSchema = z
  .strictObject({ ...itemFields, categoryId: z.uuid() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'send at least one field');
export type ItemUpdateDto = z.output<typeof itemUpdateSchema>;

export const orderSchema = z.strictObject({
  ids: z
    .array(z.uuid())
    .max(300)
    .refine((ids) => new Set(ids).size === ids.length, 'ids repeat'),
});
export type OrderDto = z.output<typeof orderSchema>;
