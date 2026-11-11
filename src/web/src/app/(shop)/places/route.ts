import { searchPlaces } from '@/lib/geocode';
import { MIN_QUERY } from '@/lib/places';
import { currentUser } from '@/lib/session';

/**
 * `?q=Gulshan block 13`: places for the address form's search, as JSON. Signed-in customers only, since
 * only they add addresses, and the geocoder is shared and rate limited.
 */
export async function GET(request: Request) {
  if (!(await currentUser())) return new Response(null, { status: 401 });
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 200);
  return Response.json(q.length < MIN_QUERY ? [] : await searchPlaces(q));
}
