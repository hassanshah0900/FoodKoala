'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { areaByLabel, type DeliveryLocation, encodeLocation, inPakistan, LOCATION_COOKIE } from '@/lib/location';

async function remember(location: DeliveryLocation): Promise<never> {
  (await cookies()).set(LOCATION_COOKIE, encodeLocation(location), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 365 * 24 * 3600,
    path: '/',
  });
  redirect('/restaurants');
}

/** From the area picker or a city tile: the form's `area` is one of AREAS. */
export async function chooseArea(form: FormData) {
  const area = areaByLabel(String(form.get('area') ?? ''));
  if (area) await remember(area);
}

/** From "Locate me". Returns an error to show when the point can't be served. */
export async function chooseCoordinates(lat: number, lng: number): Promise<{ error: string }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inPakistan({ lat, lng }))
    return { error: 'FoodKoala delivers in Pakistan only. Pick an area instead.' };
  return remember({ lat, lng, label: 'Your current location' });
}
