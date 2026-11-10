import { readPin, readRestaurantForm, setupSteps } from './restaurant-form';

const filled: Record<string, string> = {
  name: 'Karahi Darbar',
  phone: '021 3456 7890',
  line1: 'Shop 4, Block 13',
  area: 'Gulshan-e-Iqbal',
  city: 'Karachi',
  province: 'sindh',
  pin: '24.913, 67.098',
};
const read = (values: Record<string, string>, cuisines: string[]) =>
  readRestaurantForm(
    (n) => values[n] ?? '',
    (n) => (n === 'cuisines' ? cuisines : []),
  );

describe('the restaurant form', () => {
  it('reads a pin copied from a map app', () => {
    expect(readPin(' 24.913 , 67.098 ')).toEqual({ lat: 24.913, lng: 67.098 });
    expect(readPin('Gulshan')).toBeNull();
  });

  it('turns the form into RestaurantCreate', () =>
    expect(read(filled, ['karahi', 'pakistani'])).toEqual({
      restaurant: {
        name: 'Karahi Darbar',
        description: null,
        cuisines: ['karahi', 'pakistani'],
        phone: '+922134567890',
        address: { line1: 'Shop 4, Block 13', area: 'Gulshan-e-Iqbal', city: 'Karachi', province: 'sindh' },
        location: { lat: 24.913, lng: 67.098 },
        logoUrl: null,
        coverUrl: null,
      },
    }));

  it('lists what to fix', () =>
    expect(read({ name: 'K', pin: '51.5, -0.12', logoUrl: 'http://x' }, ['made-up'])).toEqual({
      errors: [
        'Give the restaurant its name.',
        'Choose 1 to 5 cuisines.',
        'Enter a Pakistani phone number riders and FoodKoala can call, e.g. 021 3456 7890.',
        'Fill in the street address, area and city.',
        'Choose the province.',
        'Set where the restaurant is on the map, as "latitude, longitude" in Pakistan.',
        'Photo links must start with https://',
      ],
    }));

  it('lists what is left before customers can order', () =>
    expect(setupSteps({ status: 'pending', hasHours: true, zones: 0, items: 3 }).map((s) => [s.label, s.done])).toEqual(
      [
        ['Add your menu', true],
        ['Set your opening hours', true],
        ['Draw where you deliver', false],
        ['FoodKoala approves your restaurant', false],
      ],
    ));
});
