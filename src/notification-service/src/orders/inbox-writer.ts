import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../db/database';
import { notifications, smsMessages } from '../db/schema';
import type { Message } from './messages';

@Injectable()
export class InboxWriter {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Saves an event's inbox entries and queues their texts in one transaction.
   * Returns how many were new: an entry recorded before (same event, same
   * person) is skipped, so a replay neither duplicates it nor texts twice.
   * Entries are dated when the event happened, not when it was consumed, so
   * the inbox stays in order even if a topic lags.
   */
  async record(eventId: string, occurredAt: Date, messages: Message[]): Promise<number> {
    return this.db.transaction(async (tx) => {
      let added = 0;
      for (const m of messages) {
        const [row] = await tx
          .insert(notifications)
          .values({
            eventId,
            userId: m.userId,
            kind: m.kind,
            title: m.title,
            body: m.body,
            data: m.data,
            createdAt: occurredAt,
          })
          .onConflictDoNothing({ target: [notifications.eventId, notifications.userId] })
          .returning({ id: notifications.id });
        if (!row) continue;
        added++;
        if (m.sms)
          await tx.insert(smsMessages).values({ notificationId: row.id, phone: m.sms.phone, body: m.sms.body });
      }
      return added;
    });
  }
}
