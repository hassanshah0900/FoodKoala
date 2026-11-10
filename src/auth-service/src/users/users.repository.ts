import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/database';
import { type Role, type User, users } from '../db/schema';

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

  /** Adds `role` unless the user has it already; returns the user as stored now. */
  async grantRole(user: User, role: Role): Promise<User> {
    if (user.roles.includes(role)) return user;
    // The condition keeps two sign-ins at once from appending the role twice.
    const [updated] = await this.db
      .update(users)
      .set({ roles: sql`array_append(${users.roles}, ${role}::auth.role)` })
      .where(and(eq(users.id, user.id), sql`not (${role}::auth.role = any(${users.roles}))`))
      .returning();
    if (updated) return updated;
    const [current] = await this.db.select().from(users).where(eq(users.id, user.id));
    return current;
  }
}
