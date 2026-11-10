import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { CartClient } from '../clients/clients';
import type { Database, Tx } from '../db/database';
import { isUniqueViolation } from '../db/errors';
import { orders, type VoucherRow, vouchers } from '../db/schema';
import { countWhere } from '../db/sql';
import type { Identity } from '../identity/identity';
import { assertCartNotEmpty } from '../orders/checkout';
import type { Page } from '../orders/order.view';
import type { PageQuery } from '../orders/orders.dto';
import { discountFor, normaliseCode, type VoucherUse } from './voucher.rules';
import { toVoucher, type Voucher, type VoucherDiscount } from './voucher.view';
import type { VoucherCreateDto, VoucherUpdateDto } from './vouchers.dto';

/** Orders that count as a use of their voucher. */
const standing = notInArray(orders.status, ['rejected', 'cancelled']);

/** What checkout needs from a voucher it applied. */
export interface Redemption {
  voucherId: string;
  discountPaisa: number;
}

@Injectable()
export class VouchersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly cart: CartClient,
  ) {}

  async create(dto: VoucherCreateDto): Promise<Voucher> {
    try {
      const [row] = await this.db.insert(vouchers).values(dto).returning();
      return toVoucher(row, 0);
    } catch (err) {
      if (isUniqueViolation(err, 'vouchers_code_key')) throw new ConflictException(`The code ${dto.code} is taken`);
      throw err;
    }
  }

  async list({ page, limit }: PageQuery): Promise<Page<Voucher>> {
    const rows = await this.db
      .select()
      .from(vouchers)
      .orderBy(desc(vouchers.createdAt), desc(vouchers.id))
      .limit(limit + 1)
      .offset((page - 1) * limit);
    return { items: await this.withUse(rows.slice(0, limit)), page, limit, hasMore: rows.length > limit };
  }

  async update(id: string, dto: VoucherUpdateDto): Promise<Voucher> {
    const [current] = await this.db.select().from(vouchers).where(eq(vouchers.id, id));
    if (!current) throw new NotFoundException('Voucher not found');
    if (dto.endsAt && dto.endsAt <= current.startsAt)
      throw new UnprocessableEntityException(['endsAt must be after the voucher starts']);
    const [row] = await this.db.update(vouchers).set(dto).where(eq(vouchers.id, id)).returning();
    const [voucher] = await this.withUse([row]);
    return voucher;
  }

  /** What the code would take off the caller's cart now; 422 with the reason if nothing. */
  async discountOnCart(me: Identity, code: string): Promise<VoucherDiscount> {
    const cart = await this.cart.get(me);
    assertCartNotEmpty(cart);
    const voucher = await this.find(this.db, code);
    const discountPaisa = discountFor(
      voucher,
      { restaurantId: cart.restaurantId, subtotalPaisa: cart.subtotalPaisa, now: new Date() },
      await this.useOf(this.db, voucher.id, me.userId),
    );
    return { code: voucher.code, description: voucher.description, discountPaisa };
  }

  /**
   * Applies the code to an order being placed in `tx`. The voucher row stays
   * locked until the order is saved, so two checkouts can't both take its last use.
   */
  async redeem(
    tx: Tx,
    customerId: string,
    code: string,
    order: { restaurantId: string; subtotalPaisa: number; now: Date },
  ): Promise<Redemption> {
    const voucher = await this.find(tx, code, true);
    const discountPaisa = discountFor(voucher, order, await this.useOf(tx, voucher.id, customerId));
    return { voucherId: voucher.id, discountPaisa };
  }

  private async find(db: Database | Tx, code: string, lock = false): Promise<VoucherRow> {
    const normalised = normaliseCode(code);
    const query = db.select().from(vouchers).where(eq(vouchers.code, normalised));
    const [voucher] = lock ? await query.for('update') : await query;
    if (!voucher) throw new UnprocessableEntityException([`There is no voucher ${normalised}`]);
    return voucher;
  }

  private async useOf(db: Database | Tx, voucherId: string, customerId: string): Promise<VoucherUse> {
    const isVoucher = eq(orders.voucherId, voucherId);
    const isCustomer = eq(orders.customerId, customerId);
    const [use] = await db
      .select({
        total: countWhere(isVoucher),
        byCustomer: countWhere(and(isVoucher, isCustomer)!),
        customerOrders: countWhere(isCustomer),
      })
      .from(orders)
      .where(and(standing, or(isVoucher, isCustomer)));
    return { total: use.total, byCustomer: use.byCustomer, customerHasOrdered: use.customerOrders > 0 };
  }

  private async withUse(rows: VoucherRow[]): Promise<Voucher[]> {
    if (!rows.length) return [];
    const counts = await this.db
      .select({ voucherId: orders.voucherId, used: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(
        and(
          standing,
          inArray(
            orders.voucherId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .groupBy(orders.voucherId);
    const used = new Map(counts.map((c) => [c.voucherId, c.used]));
    return rows.map((r) => toVoucher(r, used.get(r.id) ?? 0));
  }
}
