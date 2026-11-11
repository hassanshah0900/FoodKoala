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
import { deliveryZones, type RestaurantRow, restaurants, type Status } from '../db/schema';
import { recordRestaurantChange } from '../events/restaurant-events';
import { type HoursDto, hasWeeklyHours } from '../hours/hours';
import { type Identity, isAdmin } from '../identity/identity';
import type {
  RestaurantCreateDto,
  RestaurantUpdateDto,
  ReviewQuery,
  SlotsQuery,
  StatusChangeDto,
} from './restaurants.dto';
import {
  type ManagedRestaurant,
  openSlots,
  type Restaurant,
  toManagedRestaurant,
  toRestaurant,
} from './restaurants.view';

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
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(restaurants)
        .values({ ...fields, ...address, ...location, ownerId: me.userId })
        .returning({ id: restaurants.id });
      return toManagedRestaurant(await recordRestaurantChange(tx, row.id));
    });
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

  /** When an approved restaurant takes orders between `from` and `to`, for scheduling one. */
  async openSlots(id: string, { from, to, step }: SlotsQuery): Promise<{ slots: string[] }> {
    const [row] = await this.db.select().from(restaurants).where(eq(restaurants.id, id));
    if (row?.status !== 'approved') throw new NotFoundException('Restaurant not found');
    return { slots: openSlots(row, from, to, step).map((d) => d.toISOString()) };
  }

  async update(me: Identity, id: string, { address, location, ...fields }: RestaurantUpdateDto) {
    return this.save(me, id, { ...fields, ...address, ...location });
  }

  async setHours(me: Identity, id: string, { weekly, special }: HoursDto) {
    return this.save(me, id, { weeklyHours: weekly, specialHours: special });
  }

  async pause(me: Identity, id: string, minutes: number) {
    return this.save(me, id, { pausedUntil: new Date(Date.now() + minutes * 60_000) });
  }

  async resume(me: Identity, id: string) {
    return this.save(me, id, { pausedUntil: null });
  }

  async changeStatus(me: Identity, id: string, { status, reason }: StatusChangeDto): Promise<ManagedRestaurant> {
    return this.db.transaction(async (tx) => {
      const row = await this.findManageable(tx, me, id, { lock: true });

      const rule = TRANSITIONS[`${row.status}>${status}`];
      if (!rule) throw new ConflictException(`A ${row.status} restaurant cannot become ${status}`);
      if (rule.adminOnly && !isAdmin(me)) throw new ForbiddenException(`Only admins can make a restaurant ${status}`);
      if (rule.needsReason && !reason)
        throw new BadRequestException(`Give a reason when making a restaurant ${status}`);

      if (status === 'approved') {
        const [{ zones }] = await tx
          .select({ zones: count() })
          .from(deliveryZones)
          .where(eq(deliveryZones.restaurantId, id));
        if (!hasWeeklyHours(row.weeklyHours) || zones === 0) {
          throw new ConflictException('Add opening hours and at least one delivery zone before approval');
        }
      }

      await tx
        .update(restaurants)
        .set({ status, statusReason: rule.needsReason ? reason : null })
        .where(eq(restaurants.id, id));
      return toManagedRestaurant(await recordRestaurantChange(tx, id));
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

  /** Applies `values` to a restaurant `me` manages and records the change. */
  private async save(
    me: Identity,
    id: string,
    values: Partial<typeof restaurants.$inferInsert>,
  ): Promise<ManagedRestaurant> {
    return this.db.transaction(async (tx) => {
      await this.findManageable(tx, me, id, { lock: true });
      await tx.update(restaurants).set(values).where(eq(restaurants.id, id));
      return toManagedRestaurant(await recordRestaurantChange(tx, id));
    });
  }
}
