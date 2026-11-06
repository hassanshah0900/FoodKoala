import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, desc, eq } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database, Tx } from '../db/database';
import { addresses, profiles, type AddressRow } from '../db/schema';
import type { Identity } from '../identity/identity';
import { ProfilesService } from '../profiles/profiles.service';
import type { AddressCreateDto, AddressUpdateDto } from './addresses.dto';

/** API shape of an address (Address in the contract). */
export interface Address {
  id: string;
  label: AddressRow['label'];
  labelText: string | null;
  line1: string;
  area: string;
  city: string;
  landmark: string | null;
  instructions: string | null;
  location: { lat: number; lng: number };
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toAddress({ userId: _userId, lat, lng, ...rest }: AddressRow): Address {
  return { ...rest, location: { lat, lng } };
}

const mine = (userId: string, id: string) => and(eq(addresses.id, id), eq(addresses.userId, userId));

@Injectable()
export class AddressesService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly profiles: ProfilesService,
  ) {}

  async list(me: Identity): Promise<Address[]> {
    const rows = await this.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, me.userId))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
    return rows.map(toAddress);
  }

  async get(me: Identity, id: string): Promise<Address> {
    const [row] = await this.db.select().from(addresses).where(mine(me.userId, id));
    if (!row) throw new NotFoundException('Address not found');
    return toAddress(row);
  }

  async create(me: Identity, { location, isDefault, ...fields }: AddressCreateDto): Promise<Address> {
    await this.profiles.getOrCreate(me);
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, me.userId);

      const [{ total }] = await tx
        .select({ total: count() })
        .from(addresses)
        .where(eq(addresses.userId, me.userId));
      if (total >= this.config.MAX_ADDRESSES_PER_USER) {
        throw new ConflictException(
          `You can save up to ${this.config.MAX_ADDRESSES_PER_USER} addresses; delete one first`,
        );
      }

      const makeDefault = isDefault === true || total === 0;
      if (makeDefault) await this.clearDefault(tx, me.userId);

      const [row] = await tx
        .insert(addresses)
        .values({ ...fields, ...location, userId: me.userId, isDefault: makeDefault })
        .returning();
      return toAddress(row);
    });
  }

  async update(me: Identity, id: string, { location, isDefault, ...fields }: AddressUpdateDto): Promise<Address> {
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, me.userId);

      const [existing] = await tx.select({ id: addresses.id }).from(addresses).where(mine(me.userId, id));
      if (!existing) throw new NotFoundException('Address not found');

      if (isDefault) await this.clearDefault(tx, me.userId);
      const [row] = await tx
        .update(addresses)
        .set({ ...fields, ...location, ...(isDefault ? { isDefault: true } : {}) })
        .where(mine(me.userId, id))
        .returning();
      return toAddress(row);
    });
  }

  async remove(me: Identity, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockUser(tx, me.userId);

      const [deleted] = await tx.delete(addresses).where(mine(me.userId, id)).returning();
      if (!deleted) throw new NotFoundException('Address not found');

      if (deleted.isDefault) {
        const [next] = await tx
          .select({ id: addresses.id })
          .from(addresses)
          .where(eq(addresses.userId, me.userId))
          .orderBy(desc(addresses.createdAt))
          .limit(1);
        if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
      }
    });
  }

  /** Serialises address changes per user, so limits and the single default hold under concurrency. */
  private async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).for('update');
  }

  private async clearDefault(tx: Tx, userId: string): Promise<void> {
    await tx
      .update(addresses)
      .set({ isDefault: false })
      .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
  }
}
