import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Pricing } from '../menu/menu-client';
import type { StoredCart, StoredLine } from './cart.store';

export const MAX_QUANTITY = 50;

type Line = Pick<StoredLine, 'itemId' | 'optionIds' | 'note'>;

/** Same item, same choices, same note: one line with the quantities added. */
const sameLine = (a: Line, b: Line) =>
  a.itemId === b.itemId && a.note === b.note && a.optionIds.join() === b.optionIds.join();

export const sortedIds = (ids: string[]) => [...ids].sort();

export interface NewLine {
  restaurantId: string;
  itemId: string;
  quantity: number;
  optionIds: string[];
  note: string | null;
  replace: boolean;
}

/** The cart with `line` added (or merged into an equal line). */
export function addLine(
  cart: StoredCart | null,
  line: NewLine,
  last: StoredLine['last'],
  opts: { id: string; now: Date; maxLines: number },
): StoredCart {
  if (cart && cart.restaurantId !== line.restaurantId && !line.replace) {
    throw new ConflictException('Your cart has items from another restaurant; send replace: true to start a new cart');
  }
  const lines = cart?.restaurantId === line.restaurantId ? cart.lines : [];
  const candidate = { itemId: line.itemId, optionIds: sortedIds(line.optionIds), note: line.note };

  const existing = lines.find((l) => sameLine(l, candidate));
  if (existing) {
    const quantity = existing.quantity + line.quantity;
    if (quantity > MAX_QUANTITY) throw new BadRequestException(`At most ${MAX_QUANTITY} of the same item`);
    return {
      restaurantId: line.restaurantId,
      lines: lines.map((l) => (l === existing ? { ...l, quantity, last } : l)),
      updatedAt: opts.now.toISOString(),
    };
  }
  if (lines.length >= opts.maxLines) throw new ConflictException(`A cart can have up to ${opts.maxLines} lines`);
  return {
    restaurantId: line.restaurantId,
    lines: [...lines, { id: opts.id, ...candidate, quantity: line.quantity, last }],
    updatedAt: opts.now.toISOString(),
  };
}

export function findLine(cart: StoredCart | null, lineId: string): StoredLine {
  const line = cart?.lines.find((l) => l.id === lineId);
  if (!line) throw new NotFoundException('No such line in your cart');
  return line;
}

/** The cart with one line replaced by `line`. */
export function replaceLine(cart: StoredCart | null, line: StoredLine, now: Date): StoredCart {
  findLine(cart, line.id);
  return { ...cart!, lines: cart!.lines.map((l) => (l.id === line.id ? line : l)), updatedAt: now.toISOString() };
}

/** The cart without the line, or null when it was the last one. */
export function removeLine(cart: StoredCart | null, lineId: string, now: Date): StoredCart | null {
  findLine(cart, lineId);
  const lines = cart!.lines.filter((l) => l.id !== lineId);
  return lines.length ? { ...cart!, lines, updatedAt: now.toISOString() } : null;
}

/** API shape of Cart. */
export interface CartView {
  restaurantId: string | null;
  lines: {
    id: string;
    itemId: string;
    name: string;
    quantity: number;
    optionIds: string[];
    options: StoredLine['last']['options'];
    note: string | null;
    unitPricePaisa: number;
    lineTotalPaisa: number;
  }[];
  subtotalPaisa: number;
  problems: { lineId: string | null; message: string }[];
  updatedAt: string | null;
}

/**
 * The cart as the client sees it: fresh prices when menu-service accepted every
 * line, otherwise the last known ones plus the problems, tied to their lines.
 */
export function toView(cart: StoredCart | null, pricing: Pricing | null): CartView {
  if (!cart) return { restaurantId: null, lines: [], subtotalPaisa: 0, problems: [], updatedAt: null };

  const lines = cart.lines.map((l, i) => {
    const fresh = pricing?.ok ? pricing.lines[i] : undefined;
    const name = fresh?.name ?? l.last.name;
    const options = fresh?.options ?? l.last.options;
    const unitPricePaisa = fresh?.unitPricePaisa ?? l.last.unitPricePaisa;
    return {
      id: l.id,
      itemId: l.itemId,
      name,
      quantity: l.quantity,
      optionIds: l.optionIds,
      options,
      note: l.note,
      unitPricePaisa,
      lineTotalPaisa: unitPricePaisa * l.quantity,
    };
  });
  const problems =
    pricing && !pricing.ok
      ? pricing.problems.map((p) => ({
          lineId: p.line === null ? null : (cart.lines[p.line]?.id ?? null),
          message: p.message,
        }))
      : [];
  return {
    restaurantId: cart.restaurantId,
    lines,
    subtotalPaisa: lines.reduce((sum, l) => sum + l.lineTotalPaisa, 0),
    problems,
    updatedAt: cart.updatedAt,
  };
}
