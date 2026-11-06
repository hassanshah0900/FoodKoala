import { z } from 'zod';

// Shapes match AddressCreate / AddressUpdate in contracts/openapi/user-service.yaml.

/** Rough bounding box of Pakistan; rejects pins dropped in the sea or abroad by mistake. */
export const PAKISTAN_BOUNDS = { lat: [23.5, 37.1], lng: [60.8, 77.9] } as const;

const location = z.strictObject({
  lat: z.number().min(PAKISTAN_BOUNDS.lat[0]).max(PAKISTAN_BOUNDS.lat[1]),
  lng: z.number().min(PAKISTAN_BOUNDS.lng[0]).max(PAKISTAN_BOUNDS.lng[1]),
});

const text = (max: number) => z.string().trim().min(1).max(max);

const fields = {
  label: z.enum(['home', 'work', 'other']),
  labelText: text(40).nullable(),
  line1: text(200),
  area: text(100),
  city: text(60),
  landmark: text(200).nullable(),
  instructions: text(300).nullable(),
  location,
};

export const addressCreateSchema = z.strictObject({
  ...fields,
  labelText: fields.labelText.optional(),
  landmark: fields.landmark.optional(),
  instructions: fields.instructions.optional(),
  isDefault: z.boolean().optional(),
});
export type AddressCreateDto = z.output<typeof addressCreateSchema>;

export const addressUpdateSchema = z
  .strictObject({
    ...fields,
    isDefault: z.literal(true, { error: 'choose another address as default instead' }),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'send at least one field');
export type AddressUpdateDto = z.output<typeof addressUpdateSchema>;

export const addressIdSchema = z.uuid();
