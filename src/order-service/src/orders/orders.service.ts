import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { CartClient, RestaurantClient, UserClient } from '../clients/clients';
import type { Database, Tx } from '../db/database';
import { orderLines, orders, orderStatusHistory, outbox, type OrderRow } from '../db/schema';
import { isAdmin, type Identity } from '../identity/identity';
import { checkCart, draftOrder } from './checkout';
import { orderPlaced } from './events';
import type { CheckoutDto, PageQuery, RestaurantOrdersQuery } from './orders.dto';
import { toOrder, type Order, type Page } from './order.view';

const IDEMPOTENCY_CONSTRAINT = 'orders_customer_id_idempotency_key_key';

/** Postgres unique_violation on `constraint`, through Drizzle's error wrapper. */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    const pg = e as Error & { code?: string; constraint?: string };
    if (pg.code === '23505' && pg.constraint === constraint) return true;
  }
  return false;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly cart: CartClient,
    private readonly users: UserClient,
    private readonly restaurants: RestaurantClient,
  ) {}

  /**
   * Turns the caller's cart into an order. `created` is false when `key` was
   * used before: that checkout's order is returned and nothing else happens.
   */
  async checkout(me: Identity, key: string, dto: CheckoutDto): Promise<{ order: Order; created: boolean }> {
    const previous = await this.findByKey(me.userId, key);
    if (previous) return { order: previous, created: false };

    const [cart, address] = await Promise.all([this.cart.get(me), this.users.address(me, dto.addressId)]);
    checkCart(cart, dto.paymentMethod);
    const [restaurant, quote] = address
      ? await Promise.all([this.restaurants.get(cart.restaurantId), this.restaurants.quote(cart.restaurantId, address.location)])
      : [null, null];
    const draft = draftOrder({ cart, address, restaurant, quote, now: new Date() });

    let orderId: string;
    try {
      orderId = await this.db.transaction(async (tx) => {
        const { lines, ...fields } = draft;
        const [order] = await tx
          .insert(orders)
          .values({
            ...fields,
            customerId: me.userId,
            customerPhone: me.phone,
            idempotencyKey: key,
            paymentMethod: dto.paymentMethod,
            note: dto.note,
          })
          .returning();
        await tx.insert(orderLines).values(lines.map((l, position) => ({ ...l, orderId: order.id, position })));
        await tx
          .insert(orderStatusHistory)
          .values({ orderId: order.id, status: 'placed', actor: 'customer', actorId: me.userId, at: order.placedAt });
        await tx.insert(outbox).values(orderPlaced(order, lines));
        return order.id;
      });
    } catch (err) {
      // A concurrent retry with the same key won the race: that order is the answer.
      if (!isUniqueViolation(err, IDEMPOTENCY_CONSTRAINT)) throw err;
      const winner = await this.findByKey(me.userId, key);
      if (!winner) throw err;
      return { order: winner, created: false };
    }

    // The order stands even if this fails; the customer can still empty the cart themselves.
    await this.cart.clear(me).catch((err: unknown) => {
      this.logger.warn(`Order ${orderId} placed, but emptying the cart failed: ${String(err)}`);
    });
    return { order: await this.load(this.db, orderId), created: true };
  }

  async listMine(me: Identity, { page, limit }: PageQuery): Promise<Page<Order>> {
    return this.page(eq(orders.customerId, me.userId), page, limit);
  }

  /** A restaurant's orders, for its owner or an admin. */
  async listForRestaurant(me: Identity, restaurantId: string, query: RestaurantOrdersQuery): Promise<Page<Order>> {
    if (!isAdmin(me)) {
      const owner = await this.restaurants.isOwner(me, restaurantId);
      if (owner === null) throw new NotFoundException('Restaurant not found');
      if (!owner) throw new ForbiddenException('Not your restaurant');
    }
    const where = and(
      eq(orders.restaurantId, restaurantId),
      query.status ? inArray(orders.status, query.status) : undefined,
    );
    return this.page(where!, query.page, query.limit);
  }

  /** The order, if the caller placed it, owns its restaurant or is an admin; 404 otherwise. */
  async get(me: Identity, id: string): Promise<Order> {
    const order = await this.load(this.db, id);
    if (order.customerId === me.userId || isAdmin(me)) return order;
    if (await this.restaurants.isOwner(me, order.restaurant.id)) return order;
    throw new NotFoundException('Order not found');
  }

  private async findByKey(customerId: string, key: string): Promise<Order | null> {
    const [row] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.idempotencyKey, key)));
    return row ? this.load(this.db, row.id) : null;
  }

  protected async load(db: Database | Tx, id: string): Promise<Order> {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    if (!row) throw new NotFoundException('Order not found');
    const [view] = await this.views(db, [row]);
    return view;
  }

  private async page(where: SQL, page: number, limit: number): Promise<Page<Order>> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.placedAt), desc(orders.id))
      .limit(limit + 1)
      .offset((page - 1) * limit);
    return { items: await this.views(this.db, rows.slice(0, limit)), page, limit, hasMore: rows.length > limit };
  }

  /** Lines and timelines of several orders in two queries. */
  private async views(db: Database | Tx, rows: OrderRow[]): Promise<Order[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [lines, history] = await Promise.all([
      db.select().from(orderLines).where(inArray(orderLines.orderId, ids)),
      db.select().from(orderStatusHistory).where(inArray(orderStatusHistory.orderId, ids)),
    ]);
    return rows.map((r) => toOrder(r, lines, history));
  }
}
