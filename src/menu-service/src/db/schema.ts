import { boolean, index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export type CategoryRow = typeof categories.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
