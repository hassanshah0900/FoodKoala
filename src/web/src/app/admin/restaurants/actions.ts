'use server';

import { revalidatePath } from 'next/cache';
import { setRestaurantStatus } from '@/lib/api/restaurants';
import type { RestaurantStatus } from '@/lib/api/types';
import { requireAdmin } from '@/lib/session';
import { type StatusChangeState, statusChange } from '@/lib/status-change';

/** Approve, reject, suspend or reinstate; the list and the restaurant's page show it at once. */
export async function changeRestaurantStatus(
  id: string,
  _prev: StatusChangeState,
  form: FormData,
): Promise<StatusChangeState> {
  const { token } = await requireAdmin('/admin/restaurants');
  return statusChange(form, async (to, reason) => {
    await setRestaurantStatus(token, id, to as RestaurantStatus, reason);
    revalidatePath('/admin', 'layout');
  });
}
