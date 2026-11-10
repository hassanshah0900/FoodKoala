import { summarize } from './cart-summary';

const line = (quantity: number, lineTotalPaisa: number) => ({ quantity, lineTotalPaisa }) as never;
const delivery = { zoneId: 'z', deliveryFeePaisa: 9900, minimumOrderPaisa: 50000, deliveryTimeMinutes: 30 };

describe('summarize', () => {
  it('adds the delivery fee and counts items', () => {
    expect(summarize({ lines: [line(2, 90000), line(1, 12000)], subtotalPaisa: 102000 }, delivery)).toEqual({
      items: 3,
      subtotalPaisa: 102000,
      deliveryFeePaisa: 9900,
      discountPaisa: 0,
      tipPaisa: 0,
      totalPaisa: 111900,
      shortOfMinimumPaisa: 0,
    });
  });

  it('says how far below the minimum order the cart is', () =>
    expect(summarize({ lines: [line(1, 35000)], subtotalPaisa: 35000 }, delivery).shortOfMinimumPaisa).toBe(15000));

  it('has no fee where the restaurant does not deliver', () =>
    expect(summarize({ lines: [line(1, 35000)], subtotalPaisa: 35000 }, null)).toMatchObject({
      deliveryFeePaisa: null,
      totalPaisa: 35000,
      shortOfMinimumPaisa: 0,
    }));

  it('takes off the discount, never more than the food, and adds the tip', () => {
    const cart = { lines: [line(1, 60000)], subtotalPaisa: 60000 };
    expect(summarize(cart, delivery, { discountPaisa: 15000, tipPaisa: 5000 }).totalPaisa).toBe(
      60000 + 9900 - 15000 + 5000,
    );
    expect(summarize(cart, delivery, { discountPaisa: 90000 }).discountPaisa).toBe(60000);
  });
});
