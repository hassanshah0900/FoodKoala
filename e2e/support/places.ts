export interface Point {
  lat: number;
  lng: number;
}

/**
 * A spot somewhere in central Punjab. Each test puts its restaurant at its own
 * spot, so riders and restaurants left by other tests (or runs) are too far
 * away to be matched with its orders: delivery-service only offers an order to
 * riders within 5 km of the restaurant.
 */
export function newSpot(): Point {
  return { lat: round(30.2 + Math.random() * 1.6), lng: round(72.2 + Math.random() * 2) };
}

/** A point roughly `northMetres` and `eastMetres` from `p`. */
export function near(p: Point, northMetres: number, eastMetres: number): Point {
  const lat = p.lat + northMetres / 111_320;
  const lng = p.lng + eastMetres / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: round(lat), lng: round(lng) };
}

/** A square delivery zone about `km` from the centre to each side, as GeoJSON. */
export function squareAround(p: Point, km: number) {
  const m = km * 1000;
  // Counter-clockwise, as RFC 7946 asks of an outer ring.
  const corners = [near(p, m, -m), near(p, -m, -m), near(p, -m, m), near(p, m, m)];
  const ring = [...corners, corners[0]].map((c) => [c.lng, c.lat]);
  return { type: 'Polygon' as const, coordinates: [ring] };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;
