import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** order-service owns the `orders` Postgres schema and nothing else (ADR 0003). */
export const ordersSchema = pgSchema('orders');

export const STATUSES = ['placed', 'accepted', 'ready', 'picked_up', 'delivered', 'rejected', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export const statusEnum = ordersSchema.enum('order_status', STATUSES);

export const PAYMENT_METHODS = ['cod', 'card', 'jazzcash', 'easypaisa'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodEnum = ordersSchema.enum('payment_method', PAYMENT_METHODS);

/**
 * `rider` comes from delivery-service's events, never from this API. `system` is
 * order-service itself, e.g. rejecting an order the restaurant never answered.
 */
export const ACTORS = ['customer', 'restaurant', 'admin', 'rider', 'system'] as const;
export type Actor = (typeof ACTORS)[number];
export const actorEnum = ordersSchema.enum('actor', ACTORS);

/** The saved address as it was at checkout: later edits must not move a placed order. */
export interface DeliveryAddress {
  label: string;
  line1: string;
  area: string;
  city: string;
  landmark: string | null;
  instructions: string | null;
  location: { lat: number; lng: number };
}

export interface LineOption {
  id: string;
  group: string;
  name: string;
  pricePaisa: number;
}

export const DISCOUNT_KINDS = ['percent', 'flat'] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];
export const discountKindEnum = ordersSchema.enum('discount_kind', DISCOUNT_KINDS);

/**
 * A code customers enter at checkout for money off the subtotal. Its use is
 * counted from the orders that carry it, so a rejected or cancelled order
 * gives the use back.
 */
export const vouchers = ordersSchema.table(
  'vouchers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Upper case, never changed: orders show it. */
    code: text('code').notNull(),
    description: text('description').notNull(),
    kind: discountKindEnum('kind').notNull(),
    /** Percent off for `percent` (1 to 100), paisa off for `flat`. */
    value: integer('value').notNull(),
    /** Caps a percent discount. */
    maxDiscountPaisa: integer('max_discount_paisa'),
    minSubtotalPaisa: integer('min_subtotal_paisa').notNull().default(0),
    /** Only at this restaurant; null for any. */
    restaurantId: uuid('restaurant_id'),
    /** Only for a customer with no order yet, other than rejected or cancelled ones. */
    firstOrderOnly: boolean('first_order_only').notNull().default(false),
    /** Uses across all customers; null for no limit. */
    usageLimit: integer('usage_limit'),
    perCustomerLimit: integer('per_customer_limit').notNull().default(1),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('vouchers_code_key').on(t.code),
    check('vouchers_value_positive', sql`${t.value} > 0`),
    check('vouchers_percent_at_most_100', sql`${t.kind} <> 'percent' or ${t.value} <= 100`),
    check('vouchers_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'vouchers_limits_positive',
      sql`${t.perCustomerLimit} > 0 and (${t.usageLimit} is null or ${t.usageLimit} > 0) and (${t.maxDiscountPaisa} is null or ${t.maxDiscountPaisa} > 0) and ${t.minSubtotalPaisa} >= 0`,
    ),
  ],
);

export const orders = ordersSchema.table(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    customerPhone: text('customer_phone').notNull(),
    /** Client-chosen per checkout attempt; a retry with the same key finds this order. */
    idempotencyKey: text('idempotency_key').notNull(),
    restaurantId: uuid('restaurant_id').notNull(),
    restaurantName: text('restaurant_name').notNull(),
    /** Where the rider picks up. Null only for orders placed before it was recorded. */
    restaurantLocation: jsonb('restaurant_location').$type<{ lat: number; lng: number }>(),
    deliveryZoneId: uuid('delivery_zone_id').notNull(),
    status: statusEnum('status').notNull().default('placed'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    deliveryAddress: jsonb('delivery_address').$type<DeliveryAddress>().notNull(),
    note: text('note'),
    subtotalPaisa: integer('subtotal_paisa').notNull(),
    deliveryFeePaisa: integer('delivery_fee_paisa').notNull(),
    voucherId: uuid('voucher_id').references(() => vouchers.id),
    /** Taken off the subtotal by the voucher. */
    discountPaisa: integer('discount_paisa').notNull().default(0),
    totalPaisa: integer('total_paisa').notNull(),
    prepTimeMinutes: smallint('prep_time_minutes'),
    estimatedDeliveryAt: timestamp('estimated_delivery_at', { withTimezone: true }).notNull(),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('orders_customer_id_idempotency_key_key').on(t.customerId, t.idempotencyKey),
    index('orders_customer_id_placed_at_idx').on(t.customerId, t.placedAt),
    index('orders_restaurant_id_placed_at_idx').on(t.restaurantId, t.placedAt),
    index('orders_voucher_id_idx').on(t.voucherId).where(sql`${t.voucherId} is not null`),
    check(
      'orders_total_adds_up',
      sql`${t.totalPaisa} = ${t.subtotalPaisa} + ${t.deliveryFeePaisa} - ${t.discountPaisa}`,
    ),
    check('orders_money_not_negative', sql`${t.subtotalPaisa} >= 0 and ${t.deliveryFeePaisa} >= 0`),
    check('orders_discount_within_subtotal', sql`${t.discountPaisa} between 0 and ${t.subtotalPaisa}`),
    check('orders_discount_needs_voucher', sql`${t.discountPaisa} = 0 or ${t.voucherId} is not null`),
  ],
);

/** The lines as priced at checkout. */
export const orderLines = ordersSchema.table(
  'order_lines',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    itemId: uuid('item_id').notNull(),
    name: text('name').notNull(),
    quantity: smallint('quantity').notNull(),
    options: jsonb('options').$type<LineOption[]>().notNull(),
    note: text('note'),
    unitPricePaisa: integer('unit_price_paisa').notNull(),
    lineTotalPaisa: integer('line_total_paisa').notNull(),
  },
  (t) => [
    unique('order_lines_order_id_position_key').on(t.orderId, t.position),
    check('order_lines_quantity_positive', sql`${t.quantity} > 0`),
    check('order_lines_total_adds_up', sql`${t.lineTotalPaisa} = ${t.unitPricePaisa} * ${t.quantity}`),
  ],
);

/** Every status an order has had: its timeline, and an audit of who changed it. */
export const orderStatusHistory = ordersSchema.table(
  'order_status_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: statusEnum('status').notNull(),
    actor: actorEnum('actor').notNull(),
    /** The user who made the change; null for `system`. */
    actorId: uuid('actor_id'),
    reason: text('reason'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_status_history_order_id_idx').on(t.orderId, t.id)],
);

/**
 * Transactional outbox: events written with the change that caused them, so
 * none is lost or sent for a change that rolled back. A relay publishes
 * unpublished rows to Kafka in `id` order and sets `published_at`.
 */
export const outbox = ordersSchema.table(
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

/** A customer's rating of a delivered order: at most one per order, never changed. */
export const reviews = ordersSchema.table(
  'reviews',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull(),
    restaurantId: uuid('restaurant_id').notNull(),
    /** The rider who delivered it; null when an admin recorded the delivery. */
    riderId: uuid('rider_id'),
    restaurantRating: smallint('restaurant_rating').notNull(),
    riderRating: smallint('rider_rating'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('reviews_restaurant_rating_range', sql`${t.restaurantRating} between 1 and 5`),
    check('reviews_rider_rating_range', sql`${t.riderRating} between 1 and 5`),
    check('reviews_rider_rating_needs_rider', sql`${t.riderRating} is null or ${t.riderId} is not null`),
  ],
);

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
export type StatusHistoryRow = typeof orderStatusHistory.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type VoucherRow = typeof vouchers.$inferSelect;
