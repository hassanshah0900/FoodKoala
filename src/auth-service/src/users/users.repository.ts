import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/database';
import { type User, users } from '../db/schema';

@Injectable()
export class UsersRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Returns the user with this phone, creating a customer on first login. */
  async findOrCreateByPhone(phone: string): Promise<{ user: User; isNew: boolean }> {
    const [created] = await this.db.insert(users).values({ phone }).onConflictDoNothing().returning();
    if (created) return { user: created, isNew: true };

    const [existing] = await this.db.select().from(users).where(eq(users.phone, phone));
    return { user: existing, isNew: false };
  }
}
