'use server';

import { revalidatePath } from 'next/cache';
import { readAddress } from '@/lib/address-form';
import { refusal } from '@/lib/api/http';
import {
  addFavourite,
  deleteAddress,
  makeDefaultAddress,
  removeFavourite,
  saveAddress,
  updateProfile,
} from '@/lib/api/users';
import { currentLocation } from '@/lib/current-location';
import { accessToken, requireUser } from '@/lib/session';

export type AccountState = { error?: string; saved?: boolean };

const token = async (here = '/account') => {
  await requireUser(here);
  return (await accessToken())!;
};

async function attempt(call: () => Promise<unknown>): Promise<AccountState> {
  try {
    await call();
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { error };
  }
  revalidatePath('/account');
  return { saved: true };
}

export async function saveProfile(_prev: AccountState, form: FormData): Promise<AccountState> {
  const t = await token();
  const text = (name: string) => String(form.get(name) ?? '').trim() || null;
  const language = form.get('preferredLanguage') === 'ur' ? 'ur' : 'en';
  return attempt(() => updateProfile(t, { name: text('name'), email: text('email'), preferredLanguage: language }));
}

/** Saves a new address at the area the customer has chosen to order to. */
export async function addAccountAddress(_prev: AccountState, form: FormData): Promise<AccountState> {
  const t = await token();
  const location = await currentLocation();
  if (!location) return { error: 'Choose your area on the home page first, so the rider knows where to go.' };
  return attempt(() =>
    saveAddress(
      t,
      readAddress((name) => String(form.get(name) ?? ''), location),
    ),
  );
}

export async function makeDefault(id: string): Promise<void> {
  await makeDefaultAddress(await token(), id);
  revalidatePath('/account');
}

export async function removeAddress(id: string): Promise<void> {
  await deleteAddress(await token(), id);
  revalidatePath('/account');
}

/** Adds or removes a favourite; from a restaurant's page or the account's list. */
export async function setFavourite(restaurantId: string, favourite: boolean): Promise<void> {
  const t = await token(`/restaurant/${restaurantId}`);
  await (favourite ? addFavourite(t, restaurantId) : removeFavourite(t, restaurantId));
  revalidatePath('/account');
  revalidatePath(`/restaurant/${restaurantId}`);
}
