import {
  restaurantCreateSchema,
  restaurantUpdateSchema,
  reviewQuerySchema,
  statusChangeSchema,
} from './restaurants.dto';

const valid = {
  name: 'Karachi Biryani House',
  cuisines: ['biryani', 'bbq'],
  phone: '+922134567890',
  address: { line1: 'Shop 4, Block 13-D', area: 'Gulshan-e-Iqbal', city: 'Karachi', province: 'sindh' },
  location: { lat: 24.9204, lng: 67.0932 },
};

describe('restaurantCreateSchema', () => {
  it('accepts a minimal application', () => {
    expect(restaurantCreateSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['an unknown province', { address: { ...valid.address, province: 'karachi' } }],
    ['a pin outside Pakistan', { location: { lat: 25.2, lng: 55.27 } }],
    ['no cuisines', { cuisines: [] }],
    ['repeated cuisines', { cuisines: ['bbq', 'bbq'] }],
    ['an uppercase cuisine', { cuisines: ['BBQ'] }],
    ['a phone not in E.164', { phone: '021-34567890' }],
    ['an http logo', { logoUrl: 'http://cdn.example.pk/logo.png' }],
    ['unknown fields', { status: 'approved' }],
    ['an owner id', { ownerId: '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10' }],
  ])('rejects %s', (_, override) => {
    expect(restaurantCreateSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('restaurantUpdateSchema', () => {
  it('needs at least one field', () => {
    expect(restaurantUpdateSchema.safeParse({}).success).toBe(false);
    expect(restaurantUpdateSchema.safeParse({ description: null }).success).toBe(true);
  });
});

describe('statusChangeSchema', () => {
  it('accepts a known status with an optional reason', () => {
    expect(statusChangeSchema.safeParse({ status: 'rejected', reason: 'Blurry photos' }).success).toBe(true);
    expect(statusChangeSchema.safeParse({ status: 'closed' }).success).toBe(false);
  });
});

describe('reviewQuerySchema', () => {
  it('defaults to the first page of pending restaurants', () => {
    expect(reviewQuerySchema.parse({})).toEqual({ status: 'pending', page: 1, limit: 20 });
    expect(reviewQuerySchema.parse({ page: '2', limit: '5' })).toMatchObject({ page: 2, limit: 5 });
    expect(reviewQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
