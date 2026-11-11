import { inPakistan } from './location';

/** A place an address search found: how to call it and where it is. */
export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** Searches shorter than this aren't sent: they match half the country. */
export const MIN_QUERY = 3;

/** How many places a search shows. */
export const MAX_PLACES = 5;

/**
 * Nominatim's search answer (format=jsonv2) as places in Pakistan. Coordinates come as strings, and
 * the display name runs to the country, so it is cut to its first four parts.
 */
export function toPlaces(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  const places: Place[] = [];
  for (const r of raw as { display_name?: unknown; lat?: unknown; lon?: unknown }[]) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (typeof r.display_name !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!inPakistan({ lat, lng })) continue;
    const label = r.display_name
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(', ');
    places.push({ label, lat, lng });
  }
  return places.slice(0, MAX_PLACES);
}
