import { summarize } from './cart-summary';

const line = (quantity: number, lineTotalPaisa: number) => ({ quantity, lineTotalPaisa }) as never;
const delivery = { zoneId: 'z', deliveryFeePaisa: 9900, minimumOrderPaisa: 50000, deliveryTimeMinutes: 30 };

describe('summarize', () => {
  it('adds the delivery fee and counts items', () => {
    expect(summarize({ lines: [line(2, 90000), line(1, 12000)], subtotalPaisa: 102000 }, delivery)).toEqual({
      items: 3,
      subtotalPaisa: 102000,
      deliveryFeePaisa: 9900,
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
});
