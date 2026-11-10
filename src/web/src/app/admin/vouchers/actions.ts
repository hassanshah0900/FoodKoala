'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { refusal } from '@/lib/api/http';
import { createVoucher, updateVoucher } from '@/lib/api/orders';
import type { VoucherUpdate } from '@/lib/api/types';
import { requireAdmin } from '@/lib/session';
import { fromPktInput, readVoucherForm } from '@/lib/vouchers';

export type VoucherFormState = {
  errors?: string[];
  /** What was typed, to put back after a refusal. */
  values?: Record<string, string>;
};

const valuesOf = (form: FormData) =>
  Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]));

/** Creates the voucher and goes back to the list, or says what to fix. */
export async function addVoucher(_prev: VoucherFormState, form: FormData): Promise<VoucherFormState> {
  const { token } = await requireAdmin('/admin/vouchers/new');
  const values = valuesOf(form);
  const read = readVoucherForm((name) => values[name] ?? '');
  if ('errors' in read) return { errors: read.errors, values };
  try {
    await createVoucher(token, read.voucher);
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { errors: error.split('; '), values };
  }
  revalidatePath('/admin/vouchers');
  redirect('/admin/vouchers');
}

export type VoucherChangeState = { error?: string };

/** Pauses or resumes a voucher (the button's `active`), or changes its end, limit and description. */
export async function changeVoucher(
  id: string,
  _prev: VoucherChangeState,
  form: FormData,
): Promise<VoucherChangeState> {
  const { token } = await requireAdmin('/admin/vouchers');
  let change: VoucherUpdate;
  if (form.has('active')) {
    change = { active: form.get('active') === 'true' };
  } else {
    const endsAt = fromPktInput(String(form.get('endsAt') ?? ''));
    const limit = String(form.get('usageLimit') ?? '').trim();
    if (!endsAt) return { error: 'Choose when it ends.' };
    if (limit && !/^[1-9]\d*$/.test(limit))
      return { error: 'Total uses must be a whole number, or empty for no limit.' };
    change = {
      endsAt,
      usageLimit: limit ? Number(limit) : null,
      description: String(form.get('description') ?? '').trim(),
    };
  }
  try {
    await updateVoucher(token, id, change);
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { error };
  }
  revalidatePath('/admin/vouchers');
  return {};
}
