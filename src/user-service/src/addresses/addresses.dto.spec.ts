import { addressCreateSchema, addressUpdateSchema } from './addresses.dto';

const valid = {
  label: 'home',
  line1: ' House 12, Street 7 ',
  area: 'F-7/2',
  city: 'Islamabad',
  location: { lat: 33.7215, lng: 73.0433 },
};

describe('address validation', () => {
  it('accepts a valid address and trims text', () => {
    const parsed = addressCreateSchema.parse(valid);
    expect(parsed.line1).toBe('House 12, Street 7');
  });

  it.each([
    ['Karachi', { lat: 24.8607, lng: 67.0011 }],
    ['Gilgit', { lat: 35.9208, lng: 74.3089 }],
    ['Gwadar', { lat: 25.1216, lng: 62.3254 }],
  ])('accepts a pin in %s', (_, location) => {
    expect(addressCreateSchema.safeParse({ ...valid, location }).success).toBe(true);
  });

  it.each([
    ['Dubai', { lat: 25.2048, lng: 55.2708 }],
    ['Delhi', { lat: 28.6139, lng: 77.209 + 1 }],
    ['null island', { lat: 0, lng: 0 }],
    ['swapped lat/lng', { lat: 73.0433, lng: 33.7215 }],
  ])('rejects a pin in %s', (_, location) => {
    expect(addressCreateSchema.safeParse({ ...valid, location }).success).toBe(false);
  });

  it('rejects blank required text and unknown fields', () => {
    expect(addressCreateSchema.safeParse({ ...valid, city: '   ' }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ ...valid, userId: 'someone-else' }).success).toBe(false);
  });

  it('updates must change something and cannot unset the default', () => {
    expect(addressUpdateSchema.safeParse({}).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ isDefault: false }).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ isDefault: true }).success).toBe(true);
    expect(addressUpdateSchema.safeParse({ landmark: null }).success).toBe(true);
  });
});
