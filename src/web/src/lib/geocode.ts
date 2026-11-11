import 'server-only';
import { MAX_PLACES, type Place, toPlaces } from './places';

/**
 * A Nominatim server (OpenStreetMap's geocoder). The public one allows about one search a second and
 * asks clients to name themselves; production should point GEOCODER_URL at its own instance.
 */
const GEOCODER_URL = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';

/** Same searches are answered from cache for a day: streets don't move. */
const CACHE_SECONDS = 86_400;

/** Places in Pakistan matching what the customer typed, best first; empty if the geocoder fails. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const url = new URL('/search', GEOCODER_URL);
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: 'pk',
    limit: String(MAX_PLACES),
    'accept-language': 'en',
  }).toString();
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FoodKoala/0.1 (food delivery web app)' },
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? toPlaces(await res.json()) : [];
  } catch {
    return [];
  }
}
