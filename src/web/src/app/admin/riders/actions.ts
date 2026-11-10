'use server';

import { revalidatePath } from 'next/cache';
import { paisaFrom } from '@/lib/amount';
import { setRiderStatus, settleWithRider } from '@/lib/api/delivery';
import { refusal } from '@/lib/api/http';
import type { RiderStatus, SettlementKind } from '@/lib/api/types';
import { requireAdmin } from '@/lib/session';
import { SETTLEMENT_KINDS } from '@/lib/settlements';
import { type StatusChangeState, statusChange } from '@/lib/status-change';

export async function changeRiderStatus(
  userId: string,
  _prev: StatusChangeState,
  form: FormData,
): Promise<StatusChangeState> {
  const { token } = await requireAdmin('/admin/riders');
  return statusChange(form, async (to) => {
    await setRiderStatus(token, userId, to as RiderStatus);
    revalidatePath('/admin', 'layout');
  });
}

export type SettleState = {
  error?: string;
  saved?: boolean;
  /** What was typed, to put back after a refusal (React resets the form once the action ends). */
  values?: { kind: string; amount: string; note: string };
};

/** Records cash handed in, a payout, or earnings kept from the cash. */
export async function recordSettlement(userId: string, _prev: SettleState, form: FormData): Promise<SettleState> {
  const { token } = await requireAdmin(`/admin/riders/${userId}`);
  const values = {
    kind: String(form.get('kind') ?? ''),
    amount: String(form.get('amount') ?? ''),
    note: String(form.get('note') ?? ''),
  };
  const kind = SETTLEMENT_KINDS.find((k) => k.kind === values.kind)?.kind as SettlementKind | undefined;
  const amountPaisa = paisaFrom(values.amount);
  if (!kind) return { error: 'Choose what was settled.', values };
  if (!amountPaisa) return { error: 'Enter the amount in rupees, e.g. 1172 or 1172.50.', values };
  const note = values.note.trim() || null;
  try {
    await settleWithRider(token, userId, { kind, amountPaisa, note });
  } catch (err) {
    // e.g. 409: more cash than the rider holds, or more than they are owed.
    const error = refusal(err);
    if (error === null) throw err;
    return { error, values };
  }
  revalidatePath(`/admin/riders/${userId}`);
  return { saved: true };
}
