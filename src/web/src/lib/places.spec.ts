import { describe, expect, it } from 'vitest';
import { MAX_PLACES, toPlaces } from './places';

const karachi = {
  display_name: 'Block 13-D, Gulshan-e-Iqbal, Karachi East, Karachi Division, Sindh, 75300, Pakistan',
  lat: '24.9215',
  lon: '67.0942',
};

describe('toPlaces', () => {
  it('reads the coordinates and keeps the first four parts of the name', () => {
    expect(toPlaces([karachi])).toEqual([
      { label: 'Block 13-D, Gulshan-e-Iqbal, Karachi East, Karachi Division', lat: 24.9215, lng: 67.0942 },
    ]);
  });

  it('drops places outside Pakistan and malformed ones', () => {
    expect(
      toPlaces([
        { ...karachi, lat: '51.5', lon: '-0.12' },
        { display_name: 'No coordinates' },
        { lat: '24.9', lon: '67' },
      ]),
    ).toEqual([]);
  });

  it('keeps at most a handful', () => {
    expect(toPlaces(Array.from({ length: 9 }, () => karachi))).toHaveLength(MAX_PLACES);
  });

  it('is empty for anything that is not a list', () => {
    expect(toPlaces({ error: 'Rate limited' })).toEqual([]);
  });
});
