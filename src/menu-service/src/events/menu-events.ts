import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/database';
import { type CategoryRow, categories, type ItemRow, items, menus, outbox } from '../db/schema';

export const MENU_UPDATED = 'menu.updated';

/** contracts/events/menu.updated.schema.json */
export function menuUpdated(
  restaurantId: string,
  revision: number,
  updatedAt: Date,
  cats: CategoryRow[],
  rows: ItemRow[],
) {
  return {
    restaurantId,
    revision,
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      items: rows
        .filter((i) => i.categoryId === c.id)
        .map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          imageUrl: i.imageUrl,
          pricePaisa: i.pricePaisa,
          isAvailable: i.isAvailable,
        })),
    })),
    updatedAt: updatedAt.toISOString(),
  };
}

/**
 * Writes menu.updated with the whole menu as `tx` sees it, after the change in
 * `tx`. Bumping the revision locks the restaurant's `menus` row, so concurrent
 * changes queue up here and each event shows the change before it. Call it
 * last in every transaction that changes a menu.
 */
export async function recordMenuChange(tx: Tx, restaurantId: string): Promise<void> {
  const now = new Date();
  const [menu] = await tx
    .insert(menus)
    .values({ restaurantId, revision: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: menus.restaurantId,
      set: { revision: sql`${menus.revision} + 1`, updatedAt: now },
    })
    .returning();

  const [cats, rows] = await Promise.all([
    tx
      .select()
      .from(categories)
      .where(eq(categories.restaurantId, restaurantId))
      .orderBy(asc(categories.position), asc(categories.createdAt)),
    tx
      .select()
      .from(items)
      .where(eq(items.restaurantId, restaurantId))
      .orderBy(asc(items.position), asc(items.createdAt)),
  ]);

  const id = randomUUID();
  await tx.insert(outbox).values({
    eventId: id,
    topic: MENU_UPDATED,
    key: restaurantId,
    payload: {
      id,
      type: MENU_UPDATED,
      version: 1,
      occurredAt: now.toISOString(),
      source: 'menu-service',
      data: menuUpdated(restaurantId, menu.revision, menu.updatedAt, cats, rows),
    },
  });
}
