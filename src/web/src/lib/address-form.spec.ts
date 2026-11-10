import { readAddress } from './address-form';

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
