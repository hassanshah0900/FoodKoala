/** Where the customer wants food delivered: a point and how to call it. */
export interface DeliveryLocation {
  lat: number;
  lng: number;
  label: string;
}

/** The location cookie: read on the server to search near the customer. */
export const LOCATION_COOKIE = 'fk_location';

/** Pakistan's bounds, the same every contract uses. */
export const inPakistan = ({ lat, lng }: { lat: number; lng: number }) =>
  lat >= 23.5 && lat <= 37.1 && lng >= 60.8 && lng <= 77.9;

export const encodeLocation = (l: DeliveryLocation) => JSON.stringify({ lat: l.lat, lng: l.lng, label: l.label });

/** The cookie's location, or null if it is missing, malformed or outside Pakistan. */
export function decodeLocation(raw: string | undefined): DeliveryLocation | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DeliveryLocation>;
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number' || typeof v.label !== 'string') return null;
    const l = { lat: v.lat, lng: v.lng, label: v.label.slice(0, 80) };
    return inPakistan(l) ? l : null;
  } catch {
    return null;
  }
}

/**
 * Neighbourhoods to pick from until addresses can be geocoded: the centre of
 * each, close enough for searching which restaurants deliver there.
 */
export const AREAS: readonly { city: string; areas: readonly DeliveryLocation[] }[] = [
  {
    city: 'Karachi',
    areas: [
      { label: 'Gulshan-e-Iqbal, Karachi', lat: 24.921, lng: 67.094 },
      { label: 'DHA Phase 6, Karachi', lat: 24.806, lng: 67.065 },
      { label: 'Clifton, Karachi', lat: 24.814, lng: 67.03 },
      { label: 'North Nazimabad, Karachi', lat: 24.943, lng: 67.037 },
    ],
  },
  {
    city: 'Lahore',
    areas: [
      { label: 'Gulberg, Lahore', lat: 31.52, lng: 74.35 },
      { label: 'DHA Phase 5, Lahore', lat: 31.462, lng: 74.408 },
      { label: 'Johar Town, Lahore', lat: 31.469, lng: 74.272 },
      { label: 'Model Town, Lahore', lat: 31.483, lng: 74.326 },
    ],
  },
  {
    city: 'Islamabad',
    areas: [
      { label: 'F-7, Islamabad', lat: 33.72, lng: 73.057 },
      { label: 'G-11, Islamabad', lat: 33.668, lng: 72.997 },
      { label: 'Bahria Town, Rawalpindi', lat: 33.522, lng: 73.096 },
    ],
  },
  {
    city: 'Faisalabad',
    areas: [{ label: 'D Ground, Faisalabad', lat: 31.42, lng: 73.088 }],
  },
  {
    city: 'Peshawar',
    areas: [{ label: 'University Town, Peshawar', lat: 34.003, lng: 71.488 }],
  },
  {
    city: 'Multan',
    areas: [{ label: 'Gulgasht, Multan', lat: 30.215, lng: 71.469 }],
  },
];

/** Every area by its label, for the picker's value. */
export const areaByLabel = (label: string) => AREAS.flatMap((c) => c.areas).find((a) => a.label === label) ?? null;
