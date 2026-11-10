'use server';

import { revalidatePath } from 'next/cache';
import { setOrderStatus } from '@/lib/api/orders';
import type { OrderStatus } from '@/lib/api/types';
import { requireAdmin } from '@/lib/session';
import { type StatusChangeState, statusChange } from '@/lib/status-change';

/** Rejects or cancels an order with a reason, or marks the pickup or drop-off for its rider. */
export async function changeOrderStatus(
  id: string,
  _prev: StatusChangeState,
  form: FormData,
): Promise<StatusChangeState> {
  const { token } = await requireAdmin(`/admin/orders/${id}`);
  return statusChange(form, async (to, reason) => {
    await setOrderStatus(token, id, to as OrderStatus, reason);
    revalidatePath('/admin', 'layout');
  });
}
