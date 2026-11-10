'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { refusal } from '@/lib/api/http';
import {
  addZone,
  applyRestaurant,
  deleteZone,
  setHours,
  setRestaurantStatus,
  updateRestaurant,
  updateZone,
} from '@/lib/api/restaurants';
import { formValues } from '@/lib/form-values';
import { type HoursDraft, readHoursDraft } from '@/lib/hours-editing';
import { ownRestaurants, requireOwner } from '@/lib/owner';
import { readRestaurantForm } from '@/lib/restaurant-form';
import { readZoneForm } from '@/lib/zones';

export type SettingsState = { errors?: string[]; saved?: boolean; values?: Record<string, string> };

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
  return saved(restaurantId, () => setHours(token, restaurantId, read.hours));
}

/** Runs the change; a refusal becomes the form's message, success refreshes the console and the customer's page. */
async function saved(
  restaurantId: string,
  call: () => Promise<unknown>,
  values?: Record<string, string>,
): Promise<SettingsState> {
  try {
    await call();
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { errors: error.split('; '), values };
  }
  revalidatePath(`/vendor/${restaurantId}`, 'layout');
  revalidatePath(`/restaurant/${restaurantId}`);
  return { saved: true };
}

/** Adds a zone (no `zoneId`) or changes one; the area is a circle of the distance given around the restaurant. */
export async function saveZone(
  restaurantId: string,
  zoneId: string | null,
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { token, restaurant } = await requireOwner(restaurantId);
  const values = formValues(form);
  const read = readZoneForm((name) => values[name] ?? '', restaurant.location, zoneId !== null);
  if ('errors' in read) return { errors: read.errors, values };
  return saved(
    restaurantId,
    () => (zoneId ? updateZone(token, restaurantId, zoneId, read.zone) : addZone(token, restaurantId, read.zone)),
    values,
  );
}

export async function removeZone(restaurantId: string, zoneId: string): Promise<void> {
  const { token } = await requireOwner(restaurantId);
  await deleteZone(token, restaurantId, zoneId);
  revalidatePath(`/vendor/${restaurantId}`, 'layout');
}

/** What was typed, to put back after a refusal; the cuisines, a list, as one comma-separated value. */
const restaurantValues = (form: FormData) => ({ ...formValues(form), cuisines: form.getAll('cuisines').join(',') });

const restaurantFrom = (form: FormData) =>
  readRestaurantForm(
    (name) => String(form.get(name) ?? ''),
    (name) => form.getAll(name).map(String),
  );

/** Lists a new restaurant for the signed-in user, then opens its console (pending review). */
export async function applyAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const { token } = await ownRestaurants('/vendor/new');
  const values = restaurantValues(form);
  const read = restaurantFrom(form);
  if ('errors' in read) return { errors: read.errors, values };
  let id: string;
  try {
    id = (await applyRestaurant(token, read.restaurant)).id;
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { errors: error.split('; '), values };
  }
  redirect(`/vendor/${id}`);
}

/** Saves the restaurant's details. */
export async function saveDetails(restaurantId: string, _prev: SettingsState, form: FormData): Promise<SettingsState> {
  const { token } = await requireOwner(restaurantId);
  const values = restaurantValues(form);
  const read = restaurantFrom(form);
  if ('errors' in read) return { errors: read.errors, values };
  return saved(restaurantId, () => updateRestaurant(token, restaurantId, read.restaurant), values);
}

/** Asks FoodKoala to review a rejected restaurant again, once its owner has fixed it. */
export async function resubmit(restaurantId: string): Promise<void> {
  const { token } = await requireOwner(restaurantId);
  await setRestaurantStatus(token, restaurantId, 'pending');
  revalidatePath(`/vendor/${restaurantId}`, 'layout');
}
