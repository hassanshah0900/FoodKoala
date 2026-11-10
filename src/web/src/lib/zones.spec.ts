import { circle, farthest, offset, radiusKm, readZoneForm, zoneReach } from './zones';

const karachi = { lat: 24.913, lng: 67.098 };

describe('zones', () => {
  it('draws a closed circle the given distance away', () => {
    const ring = circle(karachi, 3).coordinates[0];
    expect(ring).toHaveLength(49);
    expect(ring.at(-1)).toEqual(ring[0]);
    for (const p of ring) expect(Math.hypot(...offset(karachi, p))).toBeCloseTo(3000, -1);
  });

  it('reads a circle back as its radius, and anything else as a custom area', () => {
    expect(radiusKm(circle(karachi, 4.5), karachi)).toBe(4.5);
    const square = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [67.08, 24.9],
          [67.12, 24.9],
          [67.12, 24.93],
          [67.08, 24.93],
          [67.08, 24.9],
        ] as [number, number][],
      ],
    };
    expect(radiusKm(square, karachi)).toBeNull();
    expect(zoneReach({ area: circle(karachi, 3) }, karachi)).toBe('within 3 km');
    expect(zoneReach({ area: square }, karachi)).toBe('custom area');
  });

  it('finds the farthest reach to scale the drawing, at least 1 km', () => {
    expect(farthest([{ area: circle(karachi, 6) }, { area: circle(karachi, 3) }], karachi)).toBeCloseTo(6000, -1);
    expect(farthest([], karachi)).toBe(1000);
  });
});

describe('the zone form', () => {
  const form = (values: Record<string, string>) => (name: string) => values[name] ?? '';
  const filled = { name: 'Nearby', radiusKm: '3', fee: '49', minimum: '300', time: '30' };

  it('turns the form into a zone with a circle around the restaurant', () => {
    const read = readZoneForm(form(filled), karachi, false);
    expect(read).toMatchObject({
      zone: { name: 'Nearby', deliveryFeePaisa: 4900, minimumOrderPaisa: 30000, deliveryTimeMinutes: 30 },
    });
    expect('zone' in read && radiusKm(read.zone.area!, karachi)).toBe(3);
  });

  it('keeps a custom area when no distance is given', () => {
    const read = readZoneForm(form({ ...filled, radiusKm: '' }), karachi, true);
    expect('zone' in read && read.zone.area).toBeUndefined();
    expect(readZoneForm(form({ ...filled, radiusKm: '' }), karachi, false)).toEqual({
      errors: ['The distance is between 0.5 and 30 km.'],
    });
  });

  it('lists what to fix', () =>
    expect(readZoneForm(form({ name: '', radiusKm: '50', fee: 'x', minimum: 'y', time: '2' }), karachi, false)).toEqual(
      {
        errors: [
          'Name the zone, e.g. Nearby.',
          'The distance is between 0.5 and 30 km.',
          'Enter the delivery fee in rupees (0 for free delivery).',
          'Enter the minimum order in rupees (0 for none).',
          'Delivery takes 5 to 180 minutes.',
        ],
      },
    ));
});
