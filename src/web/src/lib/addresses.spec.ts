import { addressLine, addressTitle, areaAndCity } from './addresses';

describe('addresses', () => {
  it('names the address', () => {
    expect(addressTitle({ label: 'home', labelText: null })).toBe('Home');
    expect(addressTitle({ label: 'other', labelText: "Ammi's house" })).toBe("Ammi's house");
  });

  it('writes it on one line', () =>
    expect(addressLine({ line1: 'House 7', area: 'Gulberg', city: 'Lahore' })).toBe('House 7, Gulberg, Lahore'));

  it('reads the area and city from a preset', () => {
    expect(areaAndCity('Gulberg, Lahore')).toEqual({ area: 'Gulberg', city: 'Lahore' });
    expect(areaAndCity('Your current location')).toEqual({ area: '', city: '' });
  });
});
