import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq, sql } from 'drizzle-orm';
import type { Database, Tx } from '../db/database';
import { type Profile, profiles } from '../db/schema';
import type { Identity } from '../identity/identity';
import type { ProfileUpdateDto } from './profiles.dto';

@Injectable()
export class ProfilesService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Returns the caller's profile, creating it on first access and syncing the phone from auth. */
  async getOrCreate(me: Identity, db: Database | Tx = this.db): Promise<Profile> {
    const [profile] = await db
      .insert(profiles)
      .values({ id: me.userId, phone: me.phone })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { phone: me.phone },
        // Only touch the row when the phone actually changed.
        setWhere: sql`${profiles.phone} is distinct from excluded.phone`,
      })
      .returning();
    if (profile) return profile;

    const [existing] = await db.select().from(profiles).where(eq(profiles.id, me.userId));
    return existing;
  }

  async update(me: Identity, changes: ProfileUpdateDto): Promise<Profile> {
    await this.getOrCreate(me);
    const [profile] = await this.db.update(profiles).set(changes).where(eq(profiles.id, me.userId)).returning();
    return profile;
  }
}
