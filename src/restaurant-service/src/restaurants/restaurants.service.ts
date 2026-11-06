import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, count, desc, eq } from 'drizzle-orm';
import type { Database, Tx } from '../db/database';
import { deliveryZones, restaurants, type RestaurantRow, type Status } from '../db/schema';
import { hasWeeklyHours, type HoursDto } from '../hours/hours';
import { isAdmin, type Identity } from '../identity/identity';
import type { RestaurantCreateDto, RestaurantUpdateDto, ReviewQuery, StatusChangeDto } from './restaurants.dto';
import { toManagedRestaurant, toRestaurant, type ManagedRestaurant, type Restaurant } from './restaurants.view';

/** Allowed status changes; see POST /{id}/status in the contract. */
const TRANSITIONS: Partial<Record<`${Status}>${Status}`, { adminOnly: boolean; needsReason: boolean }>> = {
  'pending>approved': { adminOnly: true, needsReason: false },
  'pending>rejected': { adminOnly: true, needsReason: true },
  'rejected>pending': { adminOnly: false, needsReason: false },
  'approved>suspended': { adminOnly: true, needsReason: true },
  'suspended>approved': { adminOnly: true, needsReason: false },
};

export const canManage = (me: Identity | undefined, row: Pick<RestaurantRow, 'ownerId'>): boolean =>
  !!me && (row.ownerId === me.userId || isAdmin(me));

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
}

@Injectable()
export class RestaurantsService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async create(me: Identity, { address, location, ...fields }: RestaurantCreateDto): Promise<ManagedRestaurant> {
    const [row] = await this.db
      .insert(restaurants)
      .values({ ...fields, ...address, ...location, ownerId: me.userId })
      .returning();
    return toManagedRestaurant(row);
  }

  async listMine(me: Identity): Promise<ManagedRestaurant[]> {
    const rows = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.ownerId, me.userId))
      .orderBy(desc(restaurants.createdAt));
    return rows.map((r) => toManagedRestaurant(r));
  }

  async listByStatus({ status, page, limit }: ReviewQuery): Promise<Page<ManagedRestaurant>> {
    const rows = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.status, status))
      .orderBy(asc(restaurants.createdAt), asc(restaurants.id))
      .limit(limit + 1)
      .offset((page - 1) * limit);
    return {
      items: rows.slice(0, limit).map((r) => toManagedRestaurant(r)),
      page,
      limit,
      hasMore: rows.length > limit,
    };
  }

  /** Approved restaurants for everyone; any status for the owner and admins. */
  async get(me: Identity | undefined, id: string): Promise<Restaurant | ManagedRestaurant> {
    const [row] = await this.db.select().from(restaurants).where(eq(restaurants.id, id));
    if (row && canManage(me, row)) return toManagedRestaurant(row);
    if (row?.status === 'approved') return toRestaurant(row);
    throw new NotFoundException('Restaurant not found');
  }

  async update(me: Identity, id: string, { address, location, ...fields }: RestaurantUpdateDto) {
    await this.findManageable(this.db, me, id);
    return this.save(id, { ...fields, ...address, ...location });
  }

  async setHours(me: Identity, id: string, { weekly, special }: HoursDto) {
    await this.findManageable(this.db, me, id);
    return this.save(id, { weeklyHours: weekly, specialHours: special });
  }

  async pause(me: Identity, id: string, minutes: number) {
    await this.findManageable(this.db, me, id);
    return this.save(id, { pausedUntil: new Date(Date.now() + minutes * 60_000) });
  }

  async resume(me: Identity, id: string) {
    await this.findManageable(this.db, me, id);
    return this.save(id, { pausedUntil: null });
  }

  async changeStatus(me: Identity, id: string, { status, reason }: StatusChangeDto): Promise<ManagedRestaurant> {
    return this.db.transaction(async (tx) => {
      const row = await this.findManageable(tx, me, id, { lock: true });

      const rule = TRANSITIONS[`${row.status}>${status}`];
      if (!rule) throw new ConflictException(`A ${row.status} restaurant cannot become ${status}`);
      if (rule.adminOnly && !isAdmin(me)) throw new ForbiddenException(`Only admins can make a restaurant ${status}`);
      if (rule.needsReason && !reason) throw new BadRequestException(`Give a reason when making a restaurant ${status}`);

      if (status === 'approved') {
        const [{ zones }] = await tx
          .select({ zones: count() })
          .from(deliveryZones)
          .where(eq(deliveryZones.restaurantId, id));
        if (!hasWeeklyHours(row.weeklyHours) || zones === 0) {
          throw new ConflictException('Add opening hours and at least one delivery zone before approval');
        }
      }

      const [updated] = await tx
        .update(restaurants)
        .set({ status, statusReason: rule.needsReason ? reason : null })
        .where(eq(restaurants.id, id))
        .returning();
      return toManagedRestaurant(updated);
    });
  }

  /**
   * The restaurant, if `me` owns it or is an admin. Others get 404 for
   * restaurants they cannot see and 403 for approved ones they can.
   */
  async findManageable(db: Database | Tx, me: Identity, id: string, { lock = false } = {}): Promise<RestaurantRow> {
    const query = db.select().from(restaurants).where(eq(restaurants.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row || (!canManage(me, row) && row.status !== 'approved')) {
      throw new NotFoundException('Restaurant not found');
    }
    if (!canManage(me, row)) throw new ForbiddenException('Not your restaurant');
    return row;
  }

  private async save(id: string, values: Partial<typeof restaurants.$inferInsert>): Promise<ManagedRestaurant> {
    const [row] = await this.db.update(restaurants).set(values).where(eq(restaurants.id, id)).returning();
    if (!row) throw new NotFoundException('Restaurant not found');
    return toManagedRestaurant(row);
  }
}
