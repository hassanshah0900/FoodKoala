import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** auth-service owns the `auth` Postgres schema and nothing else (ADR 0003). */
export const auth = pgSchema('auth');

export const roleEnum = auth.enum('role', ['customer', 'vendor', 'rider', 'admin']);

export const users = auth.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** E.164, e.g. +923001234567 */
  phone: text('phone').notNull().unique(),
  roles: roleEnum('roles').array().notNull().default(['customer']),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const refreshTokens = auth.table(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Every token from one login shares a family; reuse of a rotated token revokes the family. */
    familyId: uuid('family_id').notNull(),
    /** SHA-256 of the token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.familyId)],
);

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type RefreshToken = typeof refreshTokens.$inferSelect;
