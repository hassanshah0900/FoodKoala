import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { Address, Cart, DeliveryQuote } from '../clients/clients';
import { checkCart, draftOrder, rupees } from './checkout';

const restaurantId = '0b9c1f9e-4a3f-4a59-9a43-5d1b5f0b7a10';
const cart = (over: Partial<Omit<Cart, 'restaurantId'>> = {}): Cart & { restaurantId: string } => ({
  lines: [
    {
      id: 'l1',
      itemId: 'i1',
      name: 'Zinger burger',
      quantity: 2,
      options: [{ id: 'o1', group: 'Size', name: 'Large', pricePaisa: 10000 }],
      note: null,
      unitPricePaisa: 55000,
      lineTotalPaisa: 110000,
    },
  ],
  subtotalPaisa: 110000,
  problems: [],
  ...over,
  restaurantId,
});
const address: Address = {
  id: 'a1',
  label: 'home',
  labelText: null,
  line1: 'House 12, Street 4',
  area: 'DHA Phase 5',
  city: 'Lahore',
  landmark: 'Near the park',
  instructions: 'Ring twice',
  location: { lat: 31.46, lng: 74.41 },
};
const quote = (over: Partial<DeliveryQuote> = {}): DeliveryQuote => ({
  deliverable: true,
  acceptingOrders: true,
  distanceMeters: 2300,
  delivery: { zoneId: 'z1', deliveryFeePaisa: 9900, minimumOrderPaisa: 50000, deliveryTimeMinutes: 35 },
  ...over,
});
const restaurant = { id: restaurantId, name: 'Karachi Broast', location: { lat: 31.47, lng: 74.4 } };
const now = new Date('2026-11-08T10:00:00Z');

const messages = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof UnprocessableEntityException) return (err.getResponse() as { message: string[] }).message;
    throw err;
  }
  throw new Error('did not throw');
};

describe('rupees', () => {
  it.each([
    [50000, 'Rs 500'],
    [49950, 'Rs 499.50'],
    [5, 'Rs 0.05'],
  ])('%i paisa reads as %s', (paisa, text) => expect(rupees(paisa)).toBe(text));
});

describe('checkCart', () => {
  it('refuses an empty cart with 409', () => {
    expect(() => checkCart({ restaurantId: null, lines: [], subtotalPaisa: 0, problems: [] }, 'cod')).toThrow(ConflictException);
  });

  it('lists the cart problems and an unavailable payment method together', () => {
    const c = cart({ problems: [{ lineId: 'l1', message: 'Zinger burger is sold out' }] });
    expect(messages(() => checkCart(c, 'card'))).toEqual(['Zinger burger is sold out', 'Only cash on delivery is available for now']);
  });

  it('passes a clean cart paid in cash', () => {
    expect(() => checkCart(cart(), 'cod')).not.toThrow();
  });
});

describe('draftOrder', () => {
  it('prices the order from the cart and the zone, and promises the zone time', () => {
    const draft = draftOrder({ cart: cart(), address, restaurant, quote: quote(), now });
    expect(draft).toMatchObject({
      restaurantId,
      restaurantName: 'Karachi Broast',
      restaurantLocation: { lat: 31.47, lng: 74.4 },
      deliveryZoneId: 'z1',
      subtotalPaisa: 110000,
      deliveryFeePaisa: 9900,
      totalPaisa: 119900,
      estimatedDeliveryAt: new Date('2026-11-08T10:35:00Z'),
      deliveryAddress: { label: 'home', area: 'DHA Phase 5', location: { lat: 31.46, lng: 74.41 }, instructions: 'Ring twice' },
    });
    expect(draft.lines).toEqual([expect.objectContaining({ itemId: 'i1', quantity: 2, unitPricePaisa: 55000, lineTotalPaisa: 110000 })]);
  });

  it('recomputes line totals instead of trusting them', () => {
    const c = cart();
    c.lines[0].lineTotalPaisa = 1;
    expect(draftOrder({ cart: c, address, restaurant, quote: quote(), now }).subtotalPaisa).toBe(110000);
  });

  it("uses the address's own name when it has one", () => {
    const draft = draftOrder({ cart: cart(), address: { ...address, label: 'other', labelText: "Ammi's house" }, restaurant, quote: quote(), now });
    expect(draft.deliveryAddress.label).toBe("Ammi's house");
  });

  it('needs one of my saved addresses', () => {
    expect(messages(() => draftOrder({ cart: cart(), address: null, restaurant: null, quote: null, now }))).toEqual([
      'Choose one of your saved addresses',
    ]);
  });

  it('refuses with 409 when the restaurant is gone or not taking orders', () => {
    expect(() => draftOrder({ cart: cart(), address, restaurant: null, quote: null, now })).toThrow(/not taking orders any more/);
    expect(() => draftOrder({ cart: cart(), address, restaurant, quote: quote({ acceptingOrders: false }), now })).toThrow(
      new ConflictException('Karachi Broast is not taking orders right now'),
    );
  });

  it("refuses an address outside the restaurant's zones", () => {
    const outside = quote({ deliverable: false, delivery: null });
    expect(messages(() => draftOrder({ cart: cart(), address, restaurant, quote: outside, now }))).toEqual([
      "Karachi Broast doesn't deliver to DHA Phase 5, Lahore",
    ]);
  });

  it('says how much more is needed for the minimum order', () => {
    const small = cart();
    small.lines[0].quantity = 1;
    const q = quote({ delivery: { zoneId: 'z1', deliveryFeePaisa: 9900, minimumOrderPaisa: 60000, deliveryTimeMinutes: 35 } });
    expect(messages(() => draftOrder({ cart: small, address, restaurant, quote: q, now }))).toEqual([
      'The minimum order here is Rs 600; add Rs 50 more',
    ]);
  });
});
