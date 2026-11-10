'use server';

import { revalidatePath } from 'next/cache';
import { refusal } from '@/lib/api/http';
import { setHours } from '@/lib/api/restaurants';
import { type HoursDraft, readHoursDraft } from '@/lib/hours-editing';
import { requireOwner } from '@/lib/owner';

export type SettingsState = { errors?: string[]; saved?: boolean };

/** Saves the weekly and special hours from the hours editor (sent as JSON). */
export async function saveHours(restaurantId: string, _prev: SettingsState, form: FormData): Promise<SettingsState> {
  const { token } = await requireOwner(restaurantId);
  let draft: HoursDraft;
  try {
    draft = JSON.parse(String(form.get('hours')));
  } catch {
    return { errors: ['The hours could not be read; please try again.'] };
  }
  const read = readHoursDraft(draft);
  if ('errors' in read) return { errors: read.errors };
  try {
    await setHours(token, restaurantId, read.hours);
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { errors: error.split('; ') };
  }
  revalidatePath(`/vendor/${restaurantId}`, 'layout');
  revalidatePath(`/restaurant/${restaurantId}`);
  return { saved: true };
}
