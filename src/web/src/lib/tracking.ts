import type { Point, Tracking } from './api/types';
import { ago, clockTime, distance } from './format';
import { VEHICLES } from './rider';

/** A rider position older than this is shown with its age, so a dead phone doesn't look live. */
export const STALE_AFTER_MS = 2 * 60_000;

export const isTracking = (t: Tracking) => t.status !== 'delivered' && t.status !== 'cancelled';

/** Worth a map: a rider has the order and it isn't finished. */
export const showTracking = (t: Tracking) => isTracking(t) && t.rider !== null;

/** The later of two trackings, by version (socket and page refresh can deliver them in either order). */
export const newer = (a: Tracking, b: Tracking) => (b.version > a.version ? b : a);

/** What the rider is doing, in a line. */
export function riderLine(t: Tracking): string {
  const name = t.rider?.name.split(' ')[0] ?? 'Your rider';
  switch (t.status) {
    case 'waiting_for_rider':
      return 'Finding a rider for your order';
    case 'to_restaurant':
      return `${name} is heading to the restaurant`;
    case 'to_customer':
      return `${name} is on the way to you`;
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'This order is no longer being tracked';
  }
}

/** "Arriving around 13:42 · 2.4 km away", or null before the rider's first position. */
export function arrivalLine(t: Tracking): string | null {
  if (!t.eta || t.remainingMeters === null) return null;
  return `Arriving around ${clockTime(t.eta)} · ${distance(t.remainingMeters)} away`;
}

/** "Last seen 4 min ago" when the rider's phone has gone quiet, otherwise null. */
export function staleLine(t: Tracking, now = Date.now()): string | null {
  const at = t.riderLocation?.at;
  return at && now - Date.parse(at) > STALE_AFTER_MS ? `Last seen ${ago(at, now)}` : null;
}

export const vehicleLabel = (v: NonNullable<Tracking['rider']>['vehicle']) =>
  VEHICLES.find((x) => x.value === v)?.label ?? v;

/** The pins on the map: the restaurant until the food is collected, the door, and the rider. */
export function mapPins(t: Tracking): { kind: 'restaurant' | 'home' | 'rider'; at: Point }[] {
  const pins: { kind: 'restaurant' | 'home' | 'rider'; at: Point }[] = [];
  if (t.restaurant && t.status !== 'to_customer') pins.push({ kind: 'restaurant', at: t.restaurant });
  if (t.dropoff) pins.push({ kind: 'home', at: t.dropoff });
  if (t.riderLocation) pins.push({ kind: 'rider', at: { lat: t.riderLocation.lat, lng: t.riderLocation.lng } });
  return pins;
}
