import { paisaFrom } from './amount';
import type { DeliveryZone, Point, Polygon } from './api/types';

// Delivery zones as owners think of them: rings around the restaurant. Where zones
// overlap, restaurant-service charges a customer the cheapest one covering them.

const EARTH_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Metres east and north of `center`: flat enough at a city's scale. */
export function offset(center: Point, [lng, lat]: [number, number]): [number, number] {
  return [rad(lng - center.lng) * EARTH_M * Math.cos(rad(center.lat)), rad(lat - center.lat) * EARTH_M];
}

/** A closed ring of `points` positions `km` from `center`, as restaurant-service takes an area. */
export function circle(center: Point, km: number, points = 48): Polygon {
  const ring: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (2 * Math.PI * i) / points;
    const north = (km * 1000 * Math.cos(a)) / EARTH_M;
    const east = (km * 1000 * Math.sin(a)) / (EARTH_M * Math.cos(rad(center.lat)));
    ring.push([round6(center.lng + (east * 180) / Math.PI), round6(center.lat + (north * 180) / Math.PI)]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The zone's radius in km (one decimal) when it is a circle around `center`; null for any other shape. */
export function radiusKm(area: Polygon, center: Point): number | null {
  const d = area.coordinates[0].map((p) => Math.hypot(...offset(center, p)));
  const [min, max] = [Math.min(...d), Math.max(...d)];
  return max > 0 && (max - min) / max < 0.03 ? Math.round(max / 100) / 10 : null;
}

/** How far a zone reaches: "within 3 km", or "custom area" for a shape drawn some other way. */
export function zoneReach(zone: Pick<DeliveryZone, 'area'>, center: Point): string {
  const km = radiusKm(zone.area, center);
  return km === null ? 'custom area' : `within ${km} km`;
}

/** The farthest any zone reaches from the restaurant, in metres, to scale a drawing of them. */
export const farthest = (zones: Pick<DeliveryZone, 'area'>[], center: Point) =>
  Math.max(1000, ...zones.flatMap((z) => z.area.coordinates[0].map((p) => Math.hypot(...offset(center, p)))));

export interface ZoneInput {
  name: string;
  area?: Polygon;
  deliveryFeePaisa: number;
  minimumOrderPaisa: number;
  deliveryTimeMinutes: number;
}

/**
 * The zone form as DeliveryZoneCreate/Update: money in rupees, the area as a
 * radius around the restaurant. An empty radius keeps the zone's current area
 * (`keepArea`, for one drawn some other way).
 */
export function readZoneForm(
  field: (name: string) => string,
  center: Point,
  keepArea: boolean,
): { zone: ZoneInput } | { errors: string[] } {
  const errors: string[] = [];
  const name = field('name').trim();
  if (!name) errors.push('Name the zone, e.g. Nearby.');
  const radius = field('radiusKm').trim();
  const km = Number(radius);
  if (!(radius === '' && keepArea) && !(km >= 0.5 && km <= 30)) errors.push('The distance is between 0.5 and 30 km.');
  const fee = paisaFrom(field('fee') || '0');
  if (fee === null) errors.push('Enter the delivery fee in rupees (0 for free delivery).');
  const minimum = paisaFrom(field('minimum') || '0');
  if (minimum === null) errors.push('Enter the minimum order in rupees (0 for none).');
  const time = Number(field('time'));
  if (!(Number.isInteger(time) && time >= 5 && time <= 180)) errors.push('Delivery takes 5 to 180 minutes.');
  if (errors.length) return { errors };
  return {
    zone: {
      name,
      ...(radius !== '' && { area: circle(center, km) }),
      deliveryFeePaisa: fee!,
      minimumOrderPaisa: minimum!,
      deliveryTimeMinutes: time,
    },
  };
}
