import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { addLine, removeLine, replaceLine, toView } from './cart.rules';
import type { StoredCart } from './cart.store';

const now = new Date('2026-11-07T12:00:00Z');
const last = { name: 'Chicken Biryani', options: [], unitPricePaisa: 45000 };
const line = { restaurantId: 'r1', itemId: 'i1', quantity: 1, optionIds: ['b', 'a'], note: null, replace: false };
const opts = (id = 'l1', maxLines = 50) => ({ id, now, maxLines });

describe('addLine', () => {
  it('starts a cart, with sorted option ids', () => {
    expect(addLine(null, line, last, opts())).toEqual({
      restaurantId: 'r1',
      lines: [{ id: 'l1', itemId: 'i1', quantity: 1, optionIds: ['a', 'b'], note: null, last }],
      updatedAt: now.toISOString(),
    });
  });

  it('merges a line with the same item, choices and note', () => {
    const cart = addLine(null, line, last, opts());
    const merged = addLine(cart, { ...line, quantity: 2, optionIds: ['a', 'b'] }, last, opts('l2'));
    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0]).toMatchObject({ id: 'l1', quantity: 3 });
  });

  it('keeps lines with different notes apart', () => {
    const cart = addLine(null, line, last, opts());
    expect(addLine(cart, { ...line, note: 'No onions' }, last, opts('l2')).lines).toHaveLength(2);
  });

  it('caps the quantity of one line at 50', () => {
    const cart = addLine(null, { ...line, quantity: 40 }, last, opts());
    expect(() => addLine(cart, { ...line, quantity: 11 }, last, opts('l2'))).toThrow(BadRequestException);
  });

  it('refuses another restaurant unless asked to replace the cart', () => {
    const cart = addLine(null, line, last, opts());
    expect(() => addLine(cart, { ...line, restaurantId: 'r2' }, last, opts('l2'))).toThrow(ConflictException);
    const replaced = addLine(cart, { ...line, restaurantId: 'r2', replace: true }, last, opts('l2'));
    expect(replaced).toMatchObject({ restaurantId: 'r2', lines: [{ id: 'l2' }] });
  });

  it('keeps the existing lines when replace is sent for the same restaurant', () => {
    const cart = addLine(null, line, last, opts());
    expect(addLine(cart, { ...line, itemId: 'i2', replace: true }, last, opts('l2')).lines).toHaveLength(2);
  });

  it('limits the number of lines', () => {
    const cart = addLine(null, line, last, opts('l1', 1));
    expect(() => addLine(cart, { ...line, itemId: 'i2' }, last, opts('l2', 1))).toThrow(ConflictException);
  });
});

describe('replaceLine and removeLine', () => {
  const cart = addLine(addLine(null, line, last, opts()), { ...line, itemId: 'i2' }, last, opts('l2'));

  it('replace one line and 404 for unknown ones', () => {
    expect(replaceLine(cart, { ...cart.lines[0], quantity: 5 }, now).lines[0].quantity).toBe(5);
    expect(() => replaceLine(cart, { ...cart.lines[0], id: 'nope' }, now)).toThrow(NotFoundException);
    expect(() => replaceLine(null, cart.lines[0], now)).toThrow(NotFoundException);
  });

  it('remove a line, and the cart with its last line', () => {
    const one = removeLine(cart, 'l1', now);
    expect(one?.lines.map((l) => l.id)).toEqual(['l2']);
    expect(removeLine(one, 'l2', now)).toBeNull();
    expect(() => removeLine(cart, 'nope', now)).toThrow(NotFoundException);
  });
});

describe('toView', () => {
  const cart: StoredCart = addLine(null, { ...line, quantity: 2 }, last, opts());

  it('shows an empty cart', () => {
    expect(toView(null, null)).toEqual({ restaurantId: null, lines: [], subtotalPaisa: 0, problems: [], updatedAt: null });
  });

  it('uses fresh prices when menu-service accepted every line', () => {
    const view = toView(cart, {
      ok: true,
      lines: [{ itemId: 'i1', name: 'Chicken Biryani (new)', quantity: 2, options: [], unitPricePaisa: 50000, lineTotalPaisa: 100000 }],
      subtotalPaisa: 100000,
    });
    expect(view).toMatchObject({
      lines: [{ id: 'l1', name: 'Chicken Biryani (new)', unitPricePaisa: 50000, lineTotalPaisa: 100000 }],
      subtotalPaisa: 100000,
      problems: [],
    });
  });

  it('keeps the last known prices and ties problems to lines otherwise', () => {
    const view = toView(cart, {
      ok: false,
      problems: [
        { line: 0, message: 'Chicken Biryani is sold out' },
        { line: null, message: 'Something else' },
      ],
    });
    expect(view).toMatchObject({
      lines: [{ id: 'l1', unitPricePaisa: 45000, lineTotalPaisa: 90000 }],
      subtotalPaisa: 90000,
      problems: [
        { lineId: 'l1', message: 'Chicken Biryani is sold out' },
        { lineId: null, message: 'Something else' },
      ],
    });
  });
});
