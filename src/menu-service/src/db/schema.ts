import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** menu-service owns the `menu` Postgres schema and nothing else (ADR 0003). */
export const menuSchema = pgSchema('menu');

export interface Option {
  id: string;
  name: string;
  pricePaisa: number;
  isAvailable: boolean;
}

/** A choice on an item, e.g. "Choose size" (pick exactly 1) or "Add extras" (pick up to 3). */
export interface OptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: Option[];
}

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const categories = menuSchema.table(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** restaurant-service restaurant id; not a foreign key, it lives in another schema. */
    restaurantId: uuid('restaurant_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => [index('categories_restaurant_id_position_idx').on(t.restaurantId, t.position)],
);

export const items = menuSchema.table(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id').notNull(),
    // Restrict: a category must be emptied before it is deleted.
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    pricePaisa: integer('price_paisa').notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    optionGroups: jsonb('option_groups').$type<OptionGroup[]>().notNull().default([]),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('items_category_id_position_idx').on(t.categoryId, t.position),
    index('items_restaurant_id_idx').on(t.restaurantId),
  ],
);

/** One row per restaurant whose menu has changed: the `revision` sent in menu.updated. */
export const menus = menuSchema.table('menus', {
  restaurantId: uuid('restaurant_id').primaryKey(),
  /** Bumped by every change to the restaurant's menu. */
  revision: integer('revision').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Transactional outbox: events written with the change that caused them, so
 * none is lost or sent for a change that rolled back. A relay publishes
 * unpublished rows to Kafka in `id` order and sets `published_at`.
 */
export const outbox = menuSchema.table(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** The event's envelope id (contracts/README.md#event-envelope). */
    eventId: uuid('event_id').notNull().unique(),
    topic: text('topic').notNull(),
    key: text('key').notNull(),
    /** The full envelope, `data` included. */
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [index('outbox_unpublished_idx').on(t.id).where(sql`${t.publishedAt} is null`)],
);

export type CategoryRow = typeof categories.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
