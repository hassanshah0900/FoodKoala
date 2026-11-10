import { draftsOf, moved, readItemForm } from './menu-editing';

describe('menu editing', () => {
  it('moves an id up or down, and not past either end', () => {
    expect(moved(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moved(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });

  const form = (values: Record<string, string>) => (name: string) => values[name] ?? '';
  const size = {
    id: 'g1',
    name: 'Size',
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: 'o1', name: 'Half', price: '0', isAvailable: true },
      { name: 'Full', price: '450.50', isAvailable: true },
    ],
  };

  it('turns the form into ItemCreate, keeping ids and pricing in paisa', () =>
    expect(
      readItemForm(
        form({ name: ' Chicken Karahi ', price: '1,200', isAvailable: 'on', optionGroups: JSON.stringify([size]) }),
      ),
    ).toEqual({
      item: {
        name: 'Chicken Karahi',
        description: null,
        imageUrl: null,
        pricePaisa: 120000,
        isAvailable: true,
        optionGroups: [
          {
            id: 'g1',
            name: 'Size',
            minSelect: 1,
            maxSelect: 1,
            options: [
              { id: 'o1', name: 'Half', pricePaisa: 0, isAvailable: true },
              { name: 'Full', pricePaisa: 45050, isAvailable: true },
            ],
          },
        ],
      },
    }));

  it('lists what to fix', () => {
    const bad = { ...size, name: '', maxSelect: 3, options: [{ name: '', price: 'lots', isAvailable: true }] };
    expect(
      readItemForm(form({ name: '', price: 'free', imageUrl: 'http://x', optionGroups: JSON.stringify([bad]) })),
    ).toEqual({
      errors: [
        'Give the item a name.',
        'Enter the price in rupees, e.g. 450.',
        'A photo link must start with https://',
        'Name choice 1, e.g. "Size".',
        'Choice 1: every option needs a name.',
        'Choice 1: "" needs a price in rupees (0 if it adds nothing).',
        'Choice 1: customers must pick between 0 and 1, the least no more than the most.',
      ],
    });
  });

  it('opens an item with its prices in rupees', () =>
    expect(
      draftsOf({
        optionGroups: [
          {
            id: 'g1',
            name: 'Size',
            minSelect: 1,
            maxSelect: 1,
            options: [{ id: 'o1', name: 'Full', pricePaisa: 45000, isAvailable: false }],
          },
        ],
      })[0].options[0],
    ).toEqual({ id: 'o1', name: 'Full', price: '450', isAvailable: false }));
});
