import type { Earnings, SettlementKind } from './api/types';
import { rupees } from './format';

export const SETTLEMENT_KINDS: { kind: SettlementKind; label: string; hint: string }[] = [
  { kind: 'cash_deposit', label: 'Cash handed in', hint: 'The rider hands in cash they collected.' },
  { kind: 'payout', label: 'Paid to the rider', hint: 'FoodKoala pays the rider what they earned.' },
  { kind: 'kept_from_cash', label: 'Kept from the cash', hint: 'The rider keeps their earnings out of the cash.' },
];

export const settlementLabel = (kind: SettlementKind) => SETTLEMENT_KINDS.find((k) => k.kind === kind)!.label;

type Balance = Earnings['balance'];

/**
 * The settlement that clears as much as one entry can: earnings kept out of the
 * cash when the rider holds both, else the cash handed in, else a payout.
 */
export function suggestedSettlement(b: Balance): { kind: SettlementKind; amountPaisa: number } | null {
  if (b.cashInHandPaisa > 0 && b.unpaidEarningsPaisa > 0)
    return { kind: 'kept_from_cash', amountPaisa: Math.min(b.cashInHandPaisa, b.unpaidEarningsPaisa) };
  if (b.cashInHandPaisa > 0) return { kind: 'cash_deposit', amountPaisa: b.cashInHandPaisa };
  if (b.unpaidEarningsPaisa > 0) return { kind: 'payout', amountPaisa: b.unpaidEarningsPaisa };
  return null;
}

/** Who owes whom, in words, as an admin or the rider reads it. */
export function netText(netPaisa: number, reader: 'admin' | 'rider' = 'admin'): string {
  const rider = reader === 'rider' ? ['you', 'You owe'] : ['the rider', 'The rider owes'];
  if (netPaisa > 0) return `FoodKoala owes ${rider[0]} ${rupees(netPaisa)}`;
  if (netPaisa < 0) return `${rider[1]} FoodKoala ${rupees(-netPaisa)}`;
  return 'All settled';
}
