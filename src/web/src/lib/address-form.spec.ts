import { readAddress, readPin } from './address-form';

describe('readAddress', () => {
  const at = { lat: 24.92, lng: 67.09 };
  const form = (values: Record<string, string>) => (n: string) => values[n] ?? '';

  it('keeps the own name only for an "other" address, and leaves blanks out', () => {
    expect(
      readAddress(form({ label: 'home', labelText: 'Ammi', line1: ' House 7 ', area: 'Gulshan', city: 'Karachi' }), at),
    ).toEqual({
      label: 'home',
      labelText: null,
      line1: 'House 7',
      area: 'Gulshan',
      city: 'Karachi',
      landmark: null,
      instructions: null,
      location: at,
    });
    expect(readAddress(form({ label: 'other', labelText: "Ammi's house" }), at).labelText).toBe("Ammi's house");
    expect(readAddress(form({ label: 'garage' }), at).label).toBe('home');
  });
});

describe('readPin', () => {
  const area = { lat: 24.92, lng: 67.09 };
  const form = (values: Record<string, string>) => (n: string) => values[n] ?? '';

  it('takes the pin the customer placed', () => {
    expect(readPin(form({ lat: '24.9231', lng: '67.0975' }), area)).toEqual({ lat: 24.9231, lng: 67.0975 });
  });

  it('falls back to the area without a pin, with a broken one or one outside Pakistan', () => {
    expect(readPin(form({}), area)).toBe(area);
    expect(readPin(form({ lat: 'x', lng: '67' }), area)).toBe(area);
    expect(readPin(form({ lat: '51.5', lng: '-0.12' }), area)).toBe(area);
  });

  it('is what readAddress saves', () => {
    expect(readAddress(form({ lat: '24.9231', lng: '67.0975' }), area).location).toEqual({
      lat: 24.9231,
      lng: 67.0975,
    });
  });
});
