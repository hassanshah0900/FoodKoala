'use server';

import { revalidatePath } from 'next/cache';
import { applyToRide, deliveryStep, goOffline, goOnline, sendLocation } from '@/lib/api/delivery';
import { refusal } from '@/lib/api/http';
import type { Point, Rider } from '@/lib/api/types';
import { inPakistan } from '@/lib/location';
import { VEHICLES } from '@/lib/rider';
import { accessToken, requireUser } from '@/lib/session';

export type RiderState = { error?: string };

const token = async () => {
  await requireUser('/rider');
  return (await accessToken())!;
};

/** Runs a rider's call; a refusal (e.g. "carrying an order") becomes the message shown. */
async function attempt(call: () => Promise<unknown>): Promise<RiderState> {
  try {
    await call();
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { error };
  }
  revalidatePath('/rider', 'layout');
  return {};
}

export async function apply(_prev: RiderState, form: FormData): Promise<RiderState> {
  const t = await token();
  const name = String(form.get('name') ?? '').trim();
  const city = String(form.get('city') ?? '').trim();
  const vehicle = VEHICLES.find((v) => v.value === form.get('vehicle'))?.value as Rider['vehicle'] | undefined;
  if (name.length < 2 || city.length < 2 || !vehicle) return { error: 'Fill in your name, city and vehicle.' };
  return attempt(() => applyToRide(t, { name, vehicle, city }));
}

/** Starts the shift where the phone is; the browser asks the rider for their location first. */
export async function startShift(at: Point): Promise<RiderState> {
  if (!inPakistan(at)) return { error: 'Your location is outside Pakistan.' };
  const t = await token();
  return attempt(() => goOnline(t, at));
}

export async function endShift(): Promise<RiderState> {
  const t = await token();
  return attempt(() => goOffline(t));
}

/** The phone's position while online. Failures are left to the next one, a few seconds later. */
export async function reportLocation(at: Point): Promise<void> {
  if (!inPakistan(at)) return;
  await sendLocation(await token(), at).catch(() => undefined);
}

export async function step(deliveryId: string, which: 'pickup' | 'dropoff' | 'decline'): Promise<RiderState> {
  const t = await token();
  return attempt(() => deliveryStep(t, deliveryId, which));
}
