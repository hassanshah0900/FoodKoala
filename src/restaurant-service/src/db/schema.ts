import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** restaurant-service owns the `restaurants` Postgres schema and nothing else (ADR 0003). */
export const restaurantsSchema = pgSchema('restaurants');

export const STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type Status = (typeof STATUSES)[number];
export const statusEnum = restaurantsSchema.enum('restaurant_status', STATUSES);

/** Decides the sales tax authority (PRA, SRB, KPRA, BRA, ICT, ...). */
export const PROVINCES = [
  'punjab',
  'sindh',
  'khyber_pakhtunkhwa',
  'balochistan',
  'islamabad',
  'gilgit_baltistan',
  'azad_kashmir',
] as const;
export const provinceEnum = restaurantsSchema.enum('province', PROVINCES);

/** Local (Asia/Karachi) time range; `closes` before `opens` ends the next day. */
export interface TimeRange {
  opens: string;
  closes: string;
}
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Day = (typeof DAYS)[number];
export type WeeklyHours = Partial<Record<Day, TimeRange[]>>;
export interface SpecialHours {
  name: string;
  startsOn: string;
  endsOn: string;
  ranges: TimeRange[];
}

/** A GeoJSON Polygon, [lng, lat] positions. */
export interface Polygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

/**
 * PostGIS `geometry(Polygon, 4326)`, written from GeoJSON. Read it with
 * `ST_AsGeoJSON` (see zones.service.ts) rather than selecting the raw column.
 */
const polygon = customType<{ data: Polygon; driverData: string }>({
  dataType: () => 'geometry(Polygon, 4326)',
  toDriver: (value) => sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(value)}), 4326)`,
});

export const restaurants = restaurantsSchema.table(
  'restaurants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** auth-service user id of the owner (X-User-Id of whoever applied). */
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    cuisines: text('cuisines').array().notNull(),
    phone: text('phone').notNull(),
    line1: text('line1').notNull(),
    area: text('area').notNull(),
    city: text('city').notNull(),
    province: provinceEnum('province').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    logoUrl: text('logo_url'),
    coverUrl: text('cover_url'),
    weeklyHours: jsonb('weekly_hours').$type<WeeklyHours>().notNull().default({}),
    specialHours: jsonb('special_hours').$type<SpecialHours[]>().notNull().default([]),
    pausedUntil: timestamp('paused_until', { withTimezone: true }),
    status: statusEnum('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('restaurants_owner_id_idx').on(t.ownerId),
    index('restaurants_status_created_at_idx').on(t.status, t.createdAt),
  ],
);

export const deliveryZones = restaurantsSchema.table(
  'delivery_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    area: polygon('area').notNull(),
    deliveryFeePaisa: integer('delivery_fee_paisa').notNull(),
    minimumOrderPaisa: integer('minimum_order_paisa').notNull(),
    deliveryTimeMinutes: integer('delivery_time_minutes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('delivery_zones_restaurant_id_idx').on(t.restaurantId),
    // "Which zones contain this point?" is the hot query of the listing.
    index('delivery_zones_area_gist_idx').using('gist', t.area),
    // Self-crossing shapes would make "is this point inside?" meaningless.
    check('delivery_zones_area_valid', sql`ST_IsValid(${t.area})`),
  ],
);

export type RestaurantRow = typeof restaurants.$inferSelect;
