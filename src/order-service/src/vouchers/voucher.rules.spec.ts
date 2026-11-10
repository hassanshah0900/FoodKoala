import { UnprocessableEntityException } from '@nestjs/common';
import { discountFor, normaliseCode, type VoucherTerms, type VoucherUse } from './voucher.rules';

const now = new Date('2026-11-10T12:00:00Z');
const restaurantId = '33333333-3333-4333-8333-333333333333';
const terms = (over: Partial<VoucherTerms> = {}): VoucherTerms => ({
  kind: 'percent',
  value: 20,
  maxDiscountPaisa: 30000,
  minSubtotalPaisa: 50000,
  restaurantId: null,
  firstOrderOnly: false,
  usageLimit: null,
  perCustomerLimit: 1,
  startsAt: new Date('2026-11-01T00:00:00Z'),
  endsAt: new Date('2026-12-01T00:00:00Z'),
  active: true,
  ...over,
});
const unused: VoucherUse = { total: 0, byCustomer: 0, customerHasOrdered: false };
const order = (subtotalPaisa = 100000) => ({ restaurantId, subtotalPaisa, now });

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof UnprocessableEntityException) return (err.getResponse() as { message: string[] }).message[0];
    throw err;
  }
  throw new Error('did not throw');
};

describe('discountFor', () => {
  it('takes a percent off the subtotal, rounded down and capped', () => {
    expect(discountFor(terms(), order(100050), unused)).toBe(20010);
    expect(discountFor(terms(), order(200000), unused)).toBe(30000);
    expect(discountFor(terms({ maxDiscountPaisa: null }), order(200000), unused)).toBe(40000);
  });

  it('takes a flat amount off, never more than the subtotal', () => {
    expect(discountFor(terms({ kind: 'flat', value: 15000 }), order(), unused)).toBe(15000);
    expect(discountFor(terms({ kind: 'flat', value: 90000, minSubtotalPaisa: 0 }), order(60000), unused)).toBe(60000);
  });

  it.each<[string, Partial<VoucherTerms>, Partial<VoucherUse>, number?]>([
    ['This voucher has expired', { active: false }, {}],
    ['This voucher has expired', { endsAt: now }, {}],
    ['This voucher is not valid yet', { startsAt: new Date(now.getTime() + 1) }, {}],
    ['This voucher is not valid at this restaurant', { restaurantId: '44444444-4444-4444-8444-444444444444' }, {}],
    ['This voucher is for your first order only', { firstOrderOnly: true }, { customerHasOrdered: true }],
    ['You have already used this voucher', {}, { byCustomer: 1 }],
    ['You have already used this voucher 3 times', { perCustomerLimit: 3 }, { byCustomer: 3 }],
    ['This voucher has been fully used', { usageLimit: 100 }, { total: 100 }],
    ['This voucher needs a subtotal of Rs 500; add Rs 50.50 more', {}, {}, 44950],
  ])('refuses: %s', (message, over, use, subtotal) => {
    expect(reason(() => discountFor(terms(over), order(subtotal), { ...unused, ...use }))).toBe(message);
  });

  it('accepts what is just inside every limit', () => {
    const v = terms({ restaurantId, usageLimit: 100, perCustomerLimit: 2, startsAt: now });
    expect(discountFor(v, order(50000), { total: 99, byCustomer: 1, customerHasOrdered: true })).toBe(10000);
  });
});

describe('normaliseCode', () => {
  it('ignores case and surrounding spaces', () => expect(normaliseCode('  Koala50 ')).toBe('KOALA50'));
});
