import { z } from 'zod';
import { polygonSchema } from '../geo/geo';

// Shapes match DeliveryZoneCreate / DeliveryZoneUpdate in contracts/openapi/restaurant-service.yaml.

const fields = {
  name: z.string().trim().min(1).max(60),
  area: polygonSchema,
  deliveryFeePaisa: z.int().min(0).max(500_000),
  minimumOrderPaisa: z.int().min(0).max(5_000_000),
  deliveryTimeMinutes: z.int().min(5).max(180),
};

export const zoneCreateSchema = z.strictObject(fields);
export type ZoneCreateDto = z.output<typeof zoneCreateSchema>;

export const zoneUpdateSchema = z
  .strictObject(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'send at least one field');
export type ZoneUpdateDto = z.output<typeof zoneUpdateSchema>;
