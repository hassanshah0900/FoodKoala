import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../db/database';
import { notifications, smsMessages } from '../db/schema';
import type { Message } from './messages';

@Injectable()
export class InboxWriter {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Saves the inbox entry and queues its SMS in one transaction. Returns false
   * when this event was recorded before, so a replay neither duplicates the
   * entry nor texts twice. The entry is dated when the event happened, not when
   * it was consumed, so the inbox stays in order even if a topic lags.
   */
  async record(eventId: string, occurredAt: Date, m: Message): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(notifications)
        .values({ eventId, userId: m.userId, kind: m.kind, title: m.title, body: m.body, data: m.data, createdAt: occurredAt })
        .onConflictDoNothing({ target: notifications.eventId })
        .returning({ id: notifications.id });
      if (!row) return false;
      if (m.sms) await tx.insert(smsMessages).values({ notificationId: row.id, phone: m.sms.phone, body: m.sms.body });
      return true;
    });
  }
}
