import type { Point } from './api/types';
import type { NewAddress } from './api/users';

/** The new-address fields as user-service's AddressCreate, pinned at `location` (the area the customer chose). */
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
    location: { lat: location.lat, lng: location.lng },
  };
}
