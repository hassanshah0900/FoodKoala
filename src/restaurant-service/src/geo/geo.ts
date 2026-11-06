import { z } from 'zod';

/** Rough bounding box of Pakistan; rejects pins dropped in the sea or abroad by mistake. */
export const PAKISTAN_BOUNDS = { lat: [23.5, 37.1], lng: [60.8, 77.9] } as const;

export const latSchema = z.number().min(PAKISTAN_BOUNDS.lat[0]).max(PAKISTAN_BOUNDS.lat[1]);
export const lngSchema = z.number().min(PAKISTAN_BOUNDS.lng[0]).max(PAKISTAN_BOUNDS.lng[1]);

export const locationSchema = z.strictObject({ lat: latSchema, lng: lngSchema });
export type Location = z.output<typeof locationSchema>;

/** `?lat=..&lng=..` query parameters. */
export const pointQuerySchema = z.object({ lat: z.coerce.number().pipe(latSchema), lng: z.coerce.number().pipe(lngSchema) });
