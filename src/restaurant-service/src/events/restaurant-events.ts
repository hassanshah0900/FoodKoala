import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/database';
import { deliveryZones, outbox, type Polygon, type RestaurantRow, restaurants } from '../db/schema';

export const RESTAURANT_UPDATED = 'restaurant.updated';

interface Zone {
  id: string;
  area: Polygon;
  deliveryFeePaisa: number;
  minimumOrderPaisa: number;
  deliveryTimeMinutes: number;
}

/** contracts/events/restaurant.updated.schema.json */
export function restaurantUpdated(row: RestaurantRow, zones: Zone[]) {
  return {
    restaurantId: row.id,
    revision: row.revision,
    name: row.name,
    description: row.description,
    cuisines: row.cuisines,
    status: row.status,
    address: { line1: row.line1, area: row.area, city: row.city, province: row.province },
    location: { lat: row.lat, lng: row.lng },
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    hours: { weekly: row.weeklyHours, special: row.specialHours },
    pausedUntil: row.pausedUntil?.toISOString() ?? null,
    zones,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Writes restaurant.updated with the restaurant's state as `tx` sees it, after
 * the change in `tx`. Bumping `revision` locks the row, so concurrent changes
 * to one restaurant queue up here and each event shows the change before it.
 * Call it last in every transaction that changes a restaurant or its zones.
 */
export async function recordRestaurantChange(tx: Tx, restaurantId: string): Promise<RestaurantRow> {
  const [row] = await tx
    .update(restaurants)
    // Keep updated_at: a zone change is not an edit of the restaurant itself.
    .set({ revision: sql`${restaurants.revision} + 1`, updatedAt: sql`${restaurants.updatedAt}` })
    .where(eq(restaurants.id, restaurantId))
    .returning();
  if (!row) throw new Error(`restaurant ${restaurantId} vanished before its event was written`);

  const zones = await tx
    .select({
      id: deliveryZones.id,
      area: sql<string>`ST_AsGeoJSON(${deliveryZones.area})`,
      deliveryFeePaisa: deliveryZones.deliveryFeePaisa,
      minimumOrderPaisa: deliveryZones.minimumOrderPaisa,
      deliveryTimeMinutes: deliveryZones.deliveryTimeMinutes,
    })
    .from(deliveryZones)
    .where(eq(deliveryZones.restaurantId, restaurantId))
    .orderBy(asc(deliveryZones.createdAt), asc(deliveryZones.id));

  const id = randomUUID();
  const data = restaurantUpdated(
    row,
    zones.map((z) => ({ ...z, area: JSON.parse(z.area) as Polygon })),
  );
  await tx.insert(outbox).values({
    eventId: id,
    topic: RESTAURANT_UPDATED,
    key: restaurantId,
    payload: {
      id,
      type: RESTAURANT_UPDATED,
      version: 1,
      occurredAt: new Date().toISOString(),
      source: 'restaurant-service',
      data,
    },
  });
  return row;
}
