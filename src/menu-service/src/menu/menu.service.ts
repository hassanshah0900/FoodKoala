import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, eq, max, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database, Tx } from '../db/database';
import { type CategoryRow, categories, type ItemRow, items } from '../db/schema';
import { recordMenuChange } from '../events/menu-events';
import type { Identity } from '../identity/identity';
import { RestaurantAccess } from '../restaurants/restaurant-access';
import {
  type CategoryCreateDto,
  type CategoryUpdateDto,
  type ItemCreateDto,
  type ItemUpdateDto,
  withIds,
} from './menu.dto';
import { type Category, type Item, toCategory, toItem } from './menu.view';

export interface Menu {
  restaurantId: string;
  categories: (Category & { items: Item[] })[];
}

/**
 * Serialises menu changes of one restaurant inside a transaction, so limits and
 * positions hold under concurrency. There is no restaurant row here to lock.
 */
async function lockRestaurant(tx: Tx, restaurantId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${restaurantId}, 0))`);
}

/** Sets `position` to each id's index in `ids`, in one statement. The ids are validated uuids. */
async function applyOrder(tx: Tx, table: typeof categories | typeof items, ids: string[]): Promise<void> {
  // One array parameter: Drizzle would expand a JS array into a list of parameters.
  const idArray = `{${ids.join(',')}}`;
  await tx.execute(sql`
    update ${table} set position = o.pos
    from unnest(${idArray}::uuid[]) with ordinality as o(id, pos)
    where ${table.id} = o.id`);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set([...a, ...b]).size === a.length;

@Injectable()
export class MenuService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly access: RestaurantAccess,
  ) {}

  async getMenu(restaurantId: string): Promise<Menu> {
    const [cats, rows] = await Promise.all([
      this.db
        .select()
        .from(categories)
        .where(eq(categories.restaurantId, restaurantId))
        .orderBy(asc(categories.position), asc(categories.createdAt)),
      this.db
        .select()
        .from(items)
        .where(eq(items.restaurantId, restaurantId))
        .orderBy(asc(items.position), asc(items.createdAt)),
    ]);
    return {
      restaurantId,
      categories: cats.map((c) => ({
        ...toCategory(c),
        items: rows.filter((i) => i.categoryId === c.id).map(toItem),
      })),
    };
  }

  async createCategory(me: Identity, restaurantId: string, dto: CategoryCreateDto): Promise<Category> {
    await this.access.assertCanManage(me, restaurantId);
    return this.db.transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);
      const [{ total, last }] = await tx
        .select({ total: count(), last: max(categories.position) })
        .from(categories)
        .where(eq(categories.restaurantId, restaurantId));
      if (total >= this.config.MAX_CATEGORIES_PER_RESTAURANT) {
        throw new ConflictException(`A menu can have up to ${this.config.MAX_CATEGORIES_PER_RESTAURANT} categories`);
      }
      const [row] = await tx
        .insert(categories)
        .values({ ...dto, restaurantId, position: (last ?? -1) + 1 })
        .returning();
      await recordMenuChange(tx, restaurantId);
      return toCategory(row);
    });
  }

  async updateCategory(me: Identity, categoryId: string, dto: CategoryUpdateDto): Promise<Category> {
    const category = await this.manageableCategory(me, categoryId);
    return this.db.transaction(async (tx) => {
      await lockRestaurant(tx, category.restaurantId);
      const [row] = await tx.update(categories).set(dto).where(eq(categories.id, category.id)).returning();
      if (!row) throw new NotFoundException('Category not found');
      await recordMenuChange(tx, category.restaurantId);
      return toCategory(row);
    });
  }

  async deleteCategory(me: Identity, categoryId: string): Promise<void> {
    const category = await this.manageableCategory(me, categoryId);
    await this.db.transaction(async (tx) => {
      await lockRestaurant(tx, category.restaurantId);
      const [{ total }] = await tx.select({ total: count() }).from(items).where(eq(items.categoryId, categoryId));
      if (total > 0) throw new ConflictException('Move or delete the items in this category first');
      await tx.delete(categories).where(eq(categories.id, categoryId));
      await recordMenuChange(tx, category.restaurantId);
    });
  }

  async reorderCategories(me: Identity, restaurantId: string, ids: string[]): Promise<void> {
    await this.access.assertCanManage(me, restaurantId);
    await this.db.transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);
      const existing = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.restaurantId, restaurantId));
      if (
        !sameSet(
          ids,
          existing.map((c) => c.id),
        )
      ) {
        throw new BadRequestException('Send every category id of the restaurant exactly once');
      }
      await applyOrder(tx, categories, ids);
      await recordMenuChange(tx, restaurantId);
    });
  }

  async getItem(itemId: string): Promise<Item> {
    const [row] = await this.db.select().from(items).where(eq(items.id, itemId));
    if (!row) throw new NotFoundException('Item not found');
    return toItem(row);
  }

  async createItem(me: Identity, categoryId: string, { optionGroups, ...dto }: ItemCreateDto): Promise<Item> {
    const category = await this.manageableCategory(me, categoryId);
    return this.db.transaction(async (tx) => {
      await lockRestaurant(tx, category.restaurantId);
      const [{ total }] = await tx
        .select({ total: count() })
        .from(items)
        .where(eq(items.restaurantId, category.restaurantId));
      if (total >= this.config.MAX_ITEMS_PER_RESTAURANT) {
        throw new ConflictException(`A menu can have up to ${this.config.MAX_ITEMS_PER_RESTAURANT} items`);
      }
      const [row] = await tx
        .insert(items)
        .values({
          ...dto,
          optionGroups: withIds(optionGroups),
          restaurantId: category.restaurantId,
          categoryId,
          position: await this.nextItemPosition(tx, categoryId),
        })
        .returning();
      await recordMenuChange(tx, category.restaurantId);
      return toItem(row);
    });
  }

  async updateItem(me: Identity, itemId: string, { optionGroups, categoryId, ...dto }: ItemUpdateDto): Promise<Item> {
    const item = await this.manageableItem(me, itemId);
    return this.db.transaction(async (tx) => {
      await lockRestaurant(tx, item.restaurantId);
      let move: Partial<ItemRow> = {};
      if (categoryId && categoryId !== item.categoryId) {
        const [target] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.id, categoryId), eq(categories.restaurantId, item.restaurantId)));
        if (!target) throw new BadRequestException('categoryId is not a category of this restaurant');
        move = { categoryId, position: await this.nextItemPosition(tx, categoryId) };
      }
      const [row] = await tx
        .update(items)
        .set({ ...dto, ...move, ...(optionGroups ? { optionGroups: withIds(optionGroups) } : {}) })
        .where(eq(items.id, itemId))
        .returning();
      if (!row) throw new NotFoundException('Item not found');
      await recordMenuChange(tx, item.restaurantId);
      return toItem(row);
    });
  }

  async deleteItem(me: Identity, itemId: string): Promise<void> {
    const item = await this.manageableItem(me, itemId);
    await this.db.transaction(async (tx) => {
      await lockRestaurant(tx, item.restaurantId);
      const deleted = await tx.delete(items).where(eq(items.id, item.id)).returning({ id: items.id });
      if (!deleted.length) throw new NotFoundException('Item not found');
      await recordMenuChange(tx, item.restaurantId);
    });
  }

  async reorderItems(me: Identity, categoryId: string, ids: string[]): Promise<void> {
    const category = await this.manageableCategory(me, categoryId);
    await this.db.transaction(async (tx) => {
      await lockRestaurant(tx, category.restaurantId);
      const existing = await tx.select({ id: items.id }).from(items).where(eq(items.categoryId, categoryId));
      if (
        !sameSet(
          ids,
          existing.map((i) => i.id),
        )
      ) {
        throw new BadRequestException('Send every item id of the category exactly once');
      }
      await applyOrder(tx, items, ids);
      await recordMenuChange(tx, category.restaurantId);
    });
  }

  private async nextItemPosition(tx: Tx, categoryId: string): Promise<number> {
    const [{ last }] = await tx
      .select({ last: max(items.position) })
      .from(items)
      .where(eq(items.categoryId, categoryId));
    return (last ?? -1) + 1;
  }

  private async manageableCategory(me: Identity, categoryId: string): Promise<CategoryRow> {
    const [row] = await this.db.select().from(categories).where(eq(categories.id, categoryId));
    if (!row) throw new NotFoundException('Category not found');
    await this.access.assertCanManage(me, row.restaurantId);
    return row;
  }

  private async manageableItem(me: Identity, itemId: string): Promise<ItemRow> {
    const [row] = await this.db.select().from(items).where(eq(items.id, itemId));
    if (!row) throw new NotFoundException('Item not found');
    await this.access.assertCanManage(me, row.restaurantId);
    return row;
  }
}
