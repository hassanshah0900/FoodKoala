import 'server-only';
import { cookies } from 'next/headers';
import { type DeliveryLocation, decodeLocation, LOCATION_COOKIE } from './location';

/** The customer's chosen delivery location, from their cookie. */
export async function currentLocation(): Promise<DeliveryLocation | null> {
  return decodeLocation((await cookies()).get(LOCATION_COOKIE)?.value);
}
