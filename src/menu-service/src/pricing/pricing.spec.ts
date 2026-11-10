import type { OptionGroup } from '../db/schema';
import { priceLines, priceRequestSchema } from './pricing';

const ids = {
  biryani: '00000000-0000-4000-8000-000000000001',
  raita: '00000000-0000-4000-8000-000000000002',
  single: '00000000-0000-4000-8000-0000000000a1',
  full: '00000000-0000-4000-8000-0000000000a2',
  kabab: '00000000-0000-4000-8000-0000000000b1',
  egg: '00000000-0000-4000-8000-0000000000b2',
  other: '00000000-0000-4000-8000-0000000000ff',
};
const restaurantId = '00000000-0000-4000-8000-00000000000r'.replace('r', '9');

const groups: OptionGroup[] = [
  {
    id: 'g1',
    name: 'Choose size',
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: ids.single, name: 'Single', pricePaisa: 0, isAvailable: true },
      { id: ids.full, name: 'Full', pricePaisa: 35000, isAvailable: true },
    ],
  },
  {
    id: 'g2',
    name: 'Add extras',
    minSelect: 0,
    maxSelect: 2,
    options: [
      { id: ids.kabab, name: 'Shami kabab', pricePaisa: 8000, isAvailable: true },
      { id: ids.egg, name: 'Boiled egg', pricePaisa: 3000, isAvailable: false },
    ],
  },
];

const menu = new Map([
  [
    ids.biryani,
    { id: ids.biryani, name: 'Chicken Biryani', pricePaisa: 45000, isAvailable: true, optionGroups: groups },
  ],
  [ids.raita, { id: ids.raita, name: 'Raita', pricePaisa: 5000, isAvailable: false, optionGroups: [] }],
]);

const price = (lines: unknown) => priceLines(restaurantId, priceRequestSchema.parse({ lines }), menu);

describe('priceLines', () => {
  it('adds chosen options to the item price and multiplies by quantity', () => {
    const result = price([
      { itemId: ids.biryani, quantity: 2, optionIds: [ids.full, ids.kabab] },
      { itemId: ids.biryani, quantity: 1, optionIds: [ids.single] },
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        restaurantId,
        lines: [
          {
            itemId: ids.biryani,
            name: 'Chicken Biryani',
            quantity: 2,
            options: [
              { id: ids.full, group: 'Choose size', name: 'Full', pricePaisa: 35000 },
              { id: ids.kabab, group: 'Add extras', name: 'Shami kabab', pricePaisa: 8000 },
            ],
            unitPricePaisa: 88000,
            lineTotalPaisa: 176000,
          },
          expect.objectContaining({ unitPricePaisa: 45000, lineTotalPaisa: 45000 }),
        ],
        subtotalPaisa: 221000,
      },
    });
  });

  it.each([
    [
      'an item from another menu',
      [{ itemId: ids.other, quantity: 1 }],
      'lines[0]: item 00000000-0000-4000-8000-0000000000ff is not on this menu',
    ],
    ['a sold-out item', [{ itemId: ids.raita, quantity: 1 }], 'lines[0]: Raita is sold out'],
    ['a missing required choice', [{ itemId: ids.biryani, quantity: 1 }], 'lines[0]: choose 1 in "Choose size"'],
    [
      'two sizes',
      [{ itemId: ids.biryani, quantity: 1, optionIds: [ids.single, ids.full] }],
      'lines[0]: choose 1 in "Choose size"',
    ],
    [
      'a sold-out option',
      [{ itemId: ids.biryani, quantity: 1, optionIds: [ids.single, ids.egg] }],
      'lines[0]: Boiled egg is sold out',
    ],
    [
      "another item's option",
      [{ itemId: ids.biryani, quantity: 1, optionIds: [ids.single, ids.other] }],
      `lines[0]: option ${ids.other} is not a choice of Chicken Biryani`,
    ],
  ])('refuses %s', (_, lines, problem) => {
    expect(price(lines)).toEqual({ ok: false, problems: [problem] });
  });

  it('reports every problem with its line', () => {
    const result = price([
      { itemId: ids.biryani, quantity: 1, optionIds: [ids.single] },
      { itemId: ids.raita, quantity: 1 },
      { itemId: ids.biryani, quantity: 1 },
    ]);
    expect(result).toEqual({
      ok: false,
      problems: ['lines[1]: Raita is sold out', 'lines[2]: choose 1 in "Choose size"'],
    });
  });

  it('says "0 to 1" for ranges', () => {
    const drink = {
      id: ids.raita,
      name: 'Lassi',
      pricePaisa: 20000,
      isAvailable: true,
      optionGroups: [
        {
          ...groups[1],
          name: 'Add a topping',
          maxSelect: 1,
          options: groups[1].options.map((o) => ({ ...o, isAvailable: true })),
        },
      ],
    };
    const request = priceRequestSchema.parse({
      lines: [{ itemId: ids.raita, quantity: 1, optionIds: [ids.kabab, ids.egg] }],
    });
    expect(priceLines(restaurantId, request, new Map([[ids.raita, drink]]))).toEqual({
      ok: false,
      problems: ['lines[0]: choose 0 to 1 in "Add a topping"'],
    });
  });
});

describe('priceRequestSchema', () => {
  it.each([
    ['no lines', { lines: [] }],
    ['a zero quantity', { lines: [{ itemId: ids.biryani, quantity: 0 }] }],
    ['a quantity over 50', { lines: [{ itemId: ids.biryani, quantity: 51 }] }],
    ['repeated options', { lines: [{ itemId: ids.biryani, quantity: 1, optionIds: [ids.full, ids.full] }] }],
    ['a client-sent price', { lines: [{ itemId: ids.biryani, quantity: 1, pricePaisa: 1 }] }],
  ])('rejects %s', (_, body) => {
    expect(priceRequestSchema.safeParse(body).success).toBe(false);
  });
});
