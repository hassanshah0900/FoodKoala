import { Controller, Get, HttpCode, HttpStatus, Injectable, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/database';
import { notifications, type Kind, type NotificationRow } from '../db/schema';
import { CurrentUser, IdentityGuard, type Identity } from '../identity/identity';

export const inboxQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type InboxQuery = z.output<typeof inboxQuerySchema>;

/** Notification in contracts/openapi/notification-service.yaml. */
export interface NotificationView {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

const toView = (n: NotificationRow): NotificationView => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  data: n.data,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

@Injectable()
export class InboxService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async list(me: Identity, { unread, page, limit }: InboxQuery) {
    const mine = eq(notifications.userId, me.userId);
    const [rows, [{ unreadCount }]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(and(mine, unread ? isNull(notifications.readAt) : undefined))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit + 1)
        .offset((page - 1) * limit),
      this.db.select({ unreadCount: count() }).from(notifications).where(and(mine, isNull(notifications.readAt))),
    ]);
    return { items: rows.slice(0, limit).map(toView), page, limit, hasMore: rows.length > limit, unreadCount };
  }

  async markRead(me: Identity, id: string): Promise<void> {
    const [row] = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, me.userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (row) return;
    // Already read is fine; someone else's or missing is 404.
    const [exists] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, me.userId)));
    if (!exists) throw new NotFoundException('Notification not found');
  }

  async markAllRead(me: Identity): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me.userId), isNull(notifications.readAt)));
  }
}

@Controller()
@UseGuards(IdentityGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentUser() me: Identity, @Query({ schema: inboxQuerySchema }) query: InboxQuery) {
    return this.inbox.list(me, query);
  }

  // Before `:id/read` so it isn't taken for an id.
  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() me: Identity) {
    await this.inbox.markAllRead(me);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() me: Identity, @Param('id', { schema: z.uuid() }) id: string) {
    await this.inbox.markRead(me, id);
  }
}
