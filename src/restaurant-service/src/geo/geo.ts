import { z } from 'zod';

/** Rough bounding box of Pakistan; rejects pins dropped in the sea or abroad by mistake. */
export const PAKISTAN_BOUNDS = { lat: [23.5, 37.1], lng: [60.8, 77.9] } as const;

export const latSchema = z.number().min(PAKISTAN_BOUNDS.lat[0]).max(PAKISTAN_BOUNDS.lat[1]);
export const lngSchema = z.number().min(PAKISTAN_BOUNDS.lng[0]).max(PAKISTAN_BOUNDS.lng[1]);

export const locationSchema = z.strictObject({ lat: latSchema, lng: lngSchema });
export type Location = z.output<typeof locationSchema>;

/** `?lat=..&lng=..` query parameters. */
export const pointQuerySchema = z.object({
  lat: z.coerce.number().pipe(latSchema),
  lng: z.coerce.number().pipe(lngSchema),
});

const position = z.tuple([lngSchema, latSchema]);
const samePosition = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

/**
 * GeoJSON Polygon with one closed outer ring inside Pakistan. PostGIS checks
 * the rest (e.g. that the outline does not cross itself) on insert.
 */
export const polygonSchema = z
  .strictObject({
    type: z.literal('Polygon'),
    coordinates: z.tuple([z.array(position).min(4).max(500)], { error: 'use a single outer ring' }),
  })
  .refine(
    ({ coordinates: [ring] }) => samePosition(ring[0], ring[ring.length - 1]),
    'close the ring: the last position must equal the first',
  )
  .refine(
    ({ coordinates: [ring] }) => new Set(ring.map(([lng, lat]) => `${lng},${lat}`)).size >= 3,
    'a zone needs at least 3 distinct corners',
  );
