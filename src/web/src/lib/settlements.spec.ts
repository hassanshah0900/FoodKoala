import { netText, suggestedSettlement } from './settlements';

const balance = (cash: number, unpaid: number) => ({
  cashInHandPaisa: cash,
  unpaidEarningsPaisa: unpaid,
  netPaisa: unpaid - cash,
});

describe('settling with a rider', () => {
  it('keeps earnings out of the cash when the rider holds both', () =>
    expect(suggestedSettlement(balance(120000, 30000))).toEqual({ kind: 'kept_from_cash', amountPaisa: 30000 }));

  it('asks for the cash, or pays the earnings, when there is only one', () => {
    expect(suggestedSettlement(balance(90000, 0))).toEqual({ kind: 'cash_deposit', amountPaisa: 90000 });
    expect(suggestedSettlement(balance(0, 25000))).toEqual({ kind: 'payout', amountPaisa: 25000 });
    expect(suggestedSettlement(balance(0, 0))).toBeNull();
  });

  it('says who owes whom', () => {
    expect(netText(25000)).toBe('FoodKoala owes the rider Rs 250');
    expect(netText(-90000)).toBe('The rider owes FoodKoala Rs 900');
    expect(netText(0)).toBe('All settled');
  });
});
