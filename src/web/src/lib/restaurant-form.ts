import type { Point, RestaurantStatus } from './api/types';
import { CUISINES } from './cuisines';
import { inPakistan } from './location';
import { normalizeAnyPhone } from './phone';

export const PROVINCES = [
  { value: 'punjab', label: 'Punjab' },
  { value: 'sindh', label: 'Sindh' },
  { value: 'khyber_pakhtunkhwa', label: 'Khyber Pakhtunkhwa' },
  { value: 'balochistan', label: 'Balochistan' },
  { value: 'islamabad', label: 'Islamabad Capital Territory' },
  { value: 'gilgit_baltistan', label: 'Gilgit-Baltistan' },
  { value: 'azad_kashmir', label: 'Azad Kashmir' },
] as const;

export type Province = (typeof PROVINCES)[number]['value'];

/** RestaurantCreate in restaurant-service.yaml. */
export interface RestaurantInput {
  name: string;
  description: string | null;
  cuisines: string[];
  phone: string;
  address: { line1: string; area: string; city: string; province: Province };
  location: Point;
  logoUrl: string | null;
  coverUrl: string | null;
}

/** "24.9213, 67.0941" as copied from a map app; null for anything else. */
export function readPin(text: string): Point | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

const https = /^https:\/\/\S+$/;

/** The restaurant form as RestaurantCreate, or everything to fix at once. */
export function readRestaurantForm(
  field: (name: string) => string,
  all: (name: string) => string[],
): { restaurant: RestaurantInput } | { errors: string[] } {
  const errors: string[] = [];
  const name = field('name').trim();
  if (name.length < 2) errors.push('Give the restaurant its name.');
  const cuisines = all('cuisines').filter((c) => CUISINES.includes(c));
  if (cuisines.length < 1 || cuisines.length > 5) errors.push('Choose 1 to 5 cuisines.');
  const phone = normalizeAnyPhone(field('phone'));
  if (!phone) errors.push('Enter a Pakistani phone number riders and FoodKoala can call, e.g. 021 3456 7890.');
  const line1 = field('line1').trim();
  const area = field('area').trim();
  const city = field('city').trim();
  if (!line1 || !area || !city) errors.push('Fill in the street address, area and city.');
  const province = field('province') as Province;
  if (!PROVINCES.some((p) => p.value === province)) errors.push('Choose the province.');
  const location = readPin(field('pin'));
  if (!location || !inPakistan(location))
    errors.push('Set where the restaurant is on the map, as "latitude, longitude" in Pakistan.');
  const logoUrl = field('logoUrl').trim() || null;
  const coverUrl = field('coverUrl').trim() || null;
  if ((logoUrl && !https.test(logoUrl)) || (coverUrl && !https.test(coverUrl)))
    errors.push('Photo links must start with https://');
  if (errors.length) return { errors };
  return {
    restaurant: {
      name,
      description: field('description').trim() || null,
      cuisines,
      phone: phone!,
      address: { line1, area, city, province },
      location: location!,
      logoUrl,
      coverUrl,
    },
  };
}

/** What still keeps a restaurant from customers, for its owner: approval, then hours, zones and a menu. */
export function setupSteps(r: { status: RestaurantStatus; hasHours: boolean; zones: number; items: number }) {
  return [
    { done: r.items > 0, label: 'Add your menu', path: 'menu' },
    { done: r.hasHours, label: 'Set your opening hours', path: 'hours' },
    { done: r.zones > 0, label: 'Draw where you deliver', path: 'zones' },
    { done: r.status === 'approved', label: 'FoodKoala approves your restaurant', path: null },
  ];
}
