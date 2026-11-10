import { itemCreateSchema, itemUpdateSchema, orderSchema, withIds } from './menu.dto';

const size = {
  name: 'Choose size',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: 'Single', pricePaisa: 0 },
    { name: 'Full', pricePaisa: 35000 },
  ],
};

describe('itemCreateSchema', () => {
  it('fills defaults', () => {
    expect(itemCreateSchema.parse({ name: 'Chicken Biryani', pricePaisa: 45000 })).toEqual({
      name: 'Chicken Biryani',
      pricePaisa: 45000,
      isAvailable: true,
      optionGroups: [],
    });
  });

  it('accepts option groups and marks options available by default', () => {
    const parsed = itemCreateSchema.parse({ name: 'Biryani', pricePaisa: 45000, optionGroups: [size] });
    expect(parsed.optionGroups[0].options[0].isAvailable).toBe(true);
  });

  it.each([
    ['a price in rupees with decimals', { pricePaisa: 450.5 }],
    ['a negative price', { pricePaisa: -1 }],
    ['minSelect above maxSelect', { optionGroups: [{ ...size, minSelect: 2, maxSelect: 1 }] }],
    ['maxSelect above the number of options', { optionGroups: [{ ...size, maxSelect: 3 }] }],
    ['a group without options', { optionGroups: [{ ...size, minSelect: 0, options: [] }] }],
    [
      'repeated option ids',
      {
        optionGroups: [
          {
            ...size,
            options: size.options.map((o) => ({ ...o, id: '0b9d1c7e-3f5a-4c2e-9a1b-6d8e7f0a1b2c' })),
          },
        ],
      },
    ],
    ['an http image', { imageUrl: 'http://cdn.example.pk/biryani.jpg' }],
  ])('rejects %s', (_, override) => {
    expect(itemCreateSchema.safeParse({ name: 'Biryani', pricePaisa: 45000, ...override }).success).toBe(false);
  });
});

describe('itemUpdateSchema', () => {
  it('needs at least one field', () => {
    expect(itemUpdateSchema.safeParse({}).success).toBe(false);
    expect(itemUpdateSchema.safeParse({ isAvailable: false }).success).toBe(true);
  });
});

describe('withIds', () => {
  it('keeps given ids and adds missing ones', () => {
    const kept = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9';
    const [group] = withIds([
      {
        ...size,
        options: [
          { id: kept, name: 'Single', pricePaisa: 0, isAvailable: true },
          { name: 'Full', pricePaisa: 35000, isAvailable: true },
        ],
      },
    ]);
    expect(group.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(group.options[0].id).toBe(kept);
    expect(group.options[1].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('orderSchema', () => {
  it('rejects repeated ids', () => {
    const id = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9';
    expect(orderSchema.safeParse({ ids: [id, id] }).success).toBe(false);
  });
});
