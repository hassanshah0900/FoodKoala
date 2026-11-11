import type { Point } from './api/types';
import type { NewAddress } from './api/users';
import { inPakistan } from './location';

/** The pin the customer placed on the map (fields lat and lng), or `fallback` when there is none or it is off the map. */
export function readPin(field: (name: string) => string, fallback: Point): Point {
  const lat = Number.parseFloat(field('lat'));
  const lng = Number.parseFloat(field('lng'));
  return Number.isFinite(lat) && Number.isFinite(lng) && inPakistan({ lat, lng }) ? { lat, lng } : fallback;
}

/**
 * The new-address fields as user-service's AddressCreate, at the customer's pin, or at `location`
 * (the area they chose) when the map didn't load.
 */
export function readAddress(field: (name: string) => string, location: Point): NewAddress {
  const text = (name: string) => field(name).trim() || null;
  const label = field('label');
  return {
    label: label === 'work' || label === 'other' ? label : 'home',
    labelText: label === 'other' ? text('labelText') : null,
    line1: text('line1') ?? '',
    area: text('area') ?? '',
    city: text('city') ?? '',
    landmark: text('landmark'),
    instructions: text('instructions'),
    location: readPin(field, { lat: location.lat, lng: location.lng }),
  };
}
