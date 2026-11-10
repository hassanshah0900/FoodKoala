import type { Voucher } from './api/types';
import { fromPktInput, readVoucherForm, toPktInput, voucherState, voucherTerms } from './vouchers';

const voucher = (change: Partial<Voucher> = {}): Voucher => ({
  id: 'v1',
  code: 'KOALA20',
  description: '20% off',
  kind: 'percent',
  value: 20,
  maxDiscountPaisa: 15000,
  minSubtotalPaisa: 50000,
  restaurantId: null,
  firstOrderOnly: false,
  usageLimit: 100,
  perCustomerLimit: 1,
  startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-12-01T00:00:00Z',
  active: true,
  used: 3,
  createdAt: '2026-11-01T00:00:00Z',
  ...change,
});

const now = Date.parse('2026-11-10T12:00:00Z');

describe('vouchers', () => {
  it('reads its terms', () => {
    expect(voucherTerms(voucher())).toBe('20% off, up to Rs 150 · on Rs 500 or more');
    expect(voucherTerms(voucher({ kind: 'flat', value: 10000, maxDiscountPaisa: null, minSubtotalPaisa: 0 }))).toBe(
      'Rs 100 off',
    );
  });

  it.each([
    [{}, 'Live'],
    [{ active: false }, 'Paused'],
    [{ endsAt: '2026-11-10T00:00:00Z' }, 'Ended'],
    [{ used: 100 }, 'Used up'],
    [{ startsAt: '2026-11-11T00:00:00Z' }, 'Scheduled'],
  ])('%o is %s', (change, label) => expect(voucherState(voucher(change), now).label).toBe(label));

  it('takes times typed in Pakistan time', () => {
    expect(fromPktInput('2026-11-10T00:00')).toBe('2026-11-10T00:00:00+05:00');
    expect(fromPktInput('10/11/2026')).toBeNull();
    expect(toPktInput('2026-11-09T19:00:00Z')).toBe('2026-11-10T00:00');
  });

  const form = (values: Record<string, string>) => (name: string) => values[name] ?? '';
  const filled = {
    code: ' koala20 ',
    description: '20% off, up to Rs 150',
    kind: 'percent',
    value: '20',
    maxDiscount: '150',
    minSubtotal: '500',
    perCustomerLimit: '1',
    startsAt: '2026-11-10T00:00',
    endsAt: '2026-12-01T00:00',
  };

  it('turns the form into VoucherCreate with paisa and offsets', () =>
    expect(readVoucherForm(form(filled))).toEqual({
      voucher: {
        code: 'KOALA20',
        description: '20% off, up to Rs 150',
        kind: 'percent',
        value: 20,
        maxDiscountPaisa: 15000,
        minSubtotalPaisa: 50000,
        restaurantId: null,
        firstOrderOnly: false,
        usageLimit: null,
        perCustomerLimit: 1,
        startsAt: '2026-11-10T00:00:00+05:00',
        endsAt: '2026-12-01T00:00:00+05:00',
      },
    }));

  it('takes a flat amount in rupees and drops the cap', () => {
    const read = readVoucherForm(form({ ...filled, kind: 'flat', value: '100' }));
    expect(read).toMatchObject({ voucher: { kind: 'flat', value: 10000, maxDiscountPaisa: null } });
  });

  it('lists what it cannot read', () =>
    expect(
      readVoucherForm(form({ ...filled, value: '12.5', usageLimit: 'lots', perCustomerLimit: '0', endsAt: '' })),
    ).toEqual({
      errors: [
        'Enter the percent off as a whole number.',
        'Total uses must be a whole number.',
        'Uses per customer must be 1 or more.',
        'Choose when it starts and ends.',
      ],
    }));
});
