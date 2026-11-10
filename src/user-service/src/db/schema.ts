import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** user-service owns the `users` Postgres schema and nothing else (ADR 0003). */
export const usersSchema = pgSchema('users');

export const languageEnum = usersSchema.enum('language', ['en', 'ur']);
export const addressLabelEnum = usersSchema.enum('address_label', ['home', 'work', 'other']);

export const profiles = usersSchema.table('profiles', {
  /** Same id as the auth-service user (X-User-Id). */
  id: uuid('id').primaryKey(),
  phone: text('phone').notNull(),
  name: text('name'),
  email: text('email'),
  preferredLanguage: languageEnum('preferred_language').notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const addresses = usersSchema.table(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    label: addressLabelEnum('label').notNull(),
    labelText: text('label_text'),
    line1: text('line1').notNull(),
    area: text('area').notNull(),
    city: text('city').notNull(),
    landmark: text('landmark'),
    instructions: text('instructions'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('addresses_user_id_idx').on(t.userId),
    // At most one default address per user, enforced by the database.
    uniqueIndex('addresses_one_default_per_user').on(t.userId).where(sql`${t.isDefault}`),
  ],
);

/** Restaurants a user starred; restaurant ids are restaurant-service's (another schema, no foreign key). */
export const favouriteRestaurants = usersSchema.table(
  'favourite_restaurants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.restaurantId] }),
    index('favourite_restaurants_user_id_added_at_idx').on(t.userId, t.addedAt),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type AddressRow = typeof addresses.$inferSelect;
