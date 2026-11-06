import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Identity } from '../identity/identity';
import { MenuClient, type LineToPrice } from '../menu/menu-client';
import type { AddLineDto, UpdateLineDto } from './cart.dto';
import { addLine, findLine, removeLine, replaceLine, sortedIds, toView, type CartView } from './cart.rules';
import { CartStore, type StoredCart, type StoredLine } from './cart.store';

@Injectable()
export class CartService {
  constructor(
    private readonly store: CartStore,
    private readonly menu: MenuClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async get(me: Identity): Promise<CartView> {
    return this.view(await this.store.get(me.userId));
  }

  async add(me: Identity, dto: AddLineDto): Promise<CartView> {
    const last = await this.check(dto.restaurantId, dto);
    const id = randomUUID();
    const cart = await this.store.update(me.userId, (current) =>
      addLine(current, dto, last, { id, now: new Date(), maxLines: this.config.MAX_CART_LINES }),
    );
    return this.view(cart);
  }

  async update(me: Identity, lineId: string, dto: UpdateLineDto): Promise<CartView> {
    const current = await this.store.get(me.userId);
    const line = findLine(current, lineId);
    const changed = {
      quantity: dto.quantity ?? line.quantity,
      optionIds: dto.optionIds ? sortedIds(dto.optionIds) : line.optionIds,
      note: dto.note === undefined ? line.note : dto.note,
    };
    const last = await this.check(current!.restaurantId, { itemId: line.itemId, ...changed });
    const cart = await this.store.update(me.userId, (latest) =>
      replaceLine(latest, { ...line, ...changed, last }, new Date()),
    );
    return this.view(cart);
  }

  async remove(me: Identity, lineId: string): Promise<CartView> {
    return this.view(await this.store.update(me.userId, (current) => removeLine(current, lineId, new Date())));
  }

  async clear(me: Identity): Promise<void> {
    await this.store.clear(me.userId);
  }

  /** Asks menu-service whether a single line is valid; 422 with its problems if not. */
  private async check(restaurantId: string, line: LineToPrice): Promise<StoredLine['last']> {
    const pricing = await this.menu.price(restaurantId, [
      { itemId: line.itemId, quantity: line.quantity, optionIds: line.optionIds },
    ]);
    if (!pricing.ok) throw new UnprocessableEntityException(pricing.problems.map((p) => p.message));
    const [priced] = pricing.lines;
    return { name: priced.name, options: priced.options, unitPricePaisa: priced.unitPricePaisa };
  }

  private async view(cart: StoredCart | null): Promise<CartView> {
    if (!cart) return toView(null, null);
    const pricing = await this.menu.price(
      cart.restaurantId,
      cart.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds })),
    );
    return toView(cart, pricing);
  }
}
