import { pointQuerySchema, polygonSchema } from './geo';

const ring = [
  [67.07, 24.9],
  [67.14, 24.9],
  [67.14, 24.95],
  [67.07, 24.95],
  [67.07, 24.9],
];
const ok = (coordinates: unknown, type = 'Polygon') => polygonSchema.safeParse({ type, coordinates }).success;

describe('polygonSchema', () => {
  it('accepts a closed ring inside Pakistan', () => {
    expect(ok([ring])).toBe(true);
  });

  it.each([
    ['another geometry type', () => ok([ring], 'MultiPolygon')],
    ['an open ring', () => ok([ring.slice(0, 4)])],
    ['fewer than 4 positions', () => ok([[ring[0], ring[1], ring[0]]])],
    ['only 2 distinct corners', () => ok([[ring[0], ring[1], ring[1], ring[0]]])],
    ['holes (more than one ring)', () => ok([ring, ring])],
    ['[lat, lng] order (positions fall outside Pakistan)', () => ok([ring.map(([lng, lat]) => [lat, lng])])],
    ['a position with altitude', () => ok([ring.map((p) => [...p, 10])])],
    ['a corner in Dubai', () => ok([[[55.27, 25.2], ...ring.slice(1, 4), [55.27, 25.2]]])],
  ])('rejects %s', (_, check) => {
    expect(check()).toBe(false);
  });
});

describe('pointQuerySchema', () => {
  it('reads lat and lng from query strings', () => {
    expect(pointQuerySchema.parse({ lat: '24.92', lng: '67.09' })).toEqual({ lat: 24.92, lng: 67.09 });
    expect(pointQuerySchema.safeParse({ lat: '24.92' }).success).toBe(false);
    expect(pointQuerySchema.safeParse({ lat: 'abc', lng: '67' }).success).toBe(false);
    expect(pointQuerySchema.safeParse({ lat: '51.5', lng: '-0.12' }).success).toBe(false);
  });
});
