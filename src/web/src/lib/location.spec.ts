import { AREAS, areaByLabel, decodeLocation, encodeLocation, inPakistan } from './location';

describe('location', () => {
  const gulberg = { lat: 31.52, lng: 74.35, label: 'Gulberg, Lahore' };

  it('round-trips through the cookie', () => expect(decodeLocation(encodeLocation(gulberg))).toEqual(gulberg));

  it.each([undefined, '', 'not json', '{"lat":"31","lng":74,"label":"x"}', '{"lat":51.5,"lng":-0.1,"label":"London"}'])(
    'ignores a bad cookie: %s',
    (raw) => expect(decodeLocation(raw)).toBeNull(),
  );

  it('keeps every preset area inside Pakistan, with unique labels', () => {
    const areas = AREAS.flatMap((c) => c.areas);
    expect(areas.every(inPakistan)).toBe(true);
    expect(new Set(areas.map((a) => a.label)).size).toBe(areas.length);
    expect(areaByLabel('Gulberg, Lahore')).toEqual(gulberg);
    expect(areaByLabel('Atlantis')).toBeNull();
  });
});
