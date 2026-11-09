import { sql } from 'drizzle-orm';
import { bigserial, index, jsonb, pgSchema, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** notification-service owns the `notifications` Postgres schema and nothing else (ADR 0003). */
export const notificationsSchema = pgSchema('notifications');

export const KINDS = [
  'order_placed',
  'order_accepted',
  'order_ready',
  'order_picked_up',
  'order_delivered',
  'order_rejected',
  'order_cancelled',
  /** The customer's: who is bringing the order. */
  'rider_assigned',
  /** The rider's: a new job to collect. */
  'delivery_assigned',
] as const;
export type Kind = (typeof KINDS)[number];
export const kindEnum = notificationsSchema.enum('notification_kind', KINDS);

export const SMS_STATUSES = ['queued', 'sent', 'failed'] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];
export const smsStatusEnum = notificationsSchema.enum('sms_status', SMS_STATUSES);

/**
 * What the app shows in the user's inbox. One per event and person (an event
 * may concern both the customer and the rider), so a replayed event adds nothing.
 */
export const notifications = notificationsSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** Envelope id of the event that caused it (ADR 0007: events arrive at least once). */
    eventId: uuid('event_id').notNull(),
    kind: kindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** For the app to link to, e.g. `{ "orderId": "..." }`. */
    data: jsonb('data').$type<Record<string, string>>().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('notifications_event_id_user_id_key').on(t.eventId, t.userId),
    index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt),
    index('notifications_unread_idx').on(t.userId).where(sql`${t.readAt} is null`),
  ],
);

/** SMS waiting to be sent, sent, or given up on; the sender works through `queued` ones. */
export const smsMessages = notificationsSchema.table(
  'sms_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    notificationId: uuid('notification_id')
      .notNull()
      .unique()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    body: text('body').notNull(),
    status: smsStatusEnum('status').notNull().default('queued'),
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    /** The provider's message id, e.g. Twilio's SM... sid. */
    providerId: text('provider_id'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('sms_messages_queued_idx').on(t.nextAttemptAt).where(sql`${t.status} = 'queued'`)],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type SmsRow = typeof smsMessages.$inferSelect;
