import { fromPrice } from './menu';

const option = (pricePaisa: number, isAvailable = true) => ({
  id: String(pricePaisa),
  name: 'x',
  pricePaisa,
  isAvailable,
});

describe('fromPrice', () => {
  it('is the price when nothing must be chosen', () => {
    expect(fromPrice({ pricePaisa: 45000, optionGroups: [] })).toBe(45000);
    expect(
      fromPrice({
        pricePaisa: 45000,
        optionGroups: [{ id: 'g', name: 'Extras', minSelect: 0, maxSelect: 3, options: [option(5000)] }],
      }),
    ).toBe(45000);
  });

  it('adds the cheapest available required choices', () => {
    const size = {
      id: 's',
      name: 'Size',
      minSelect: 1,
      maxSelect: 1,
      options: [option(0, false), option(20000), option(10000)],
    };
    const sauces = {
      id: 'd',
      name: 'Dips',
      minSelect: 2,
      maxSelect: 2,
      options: [option(3000), option(1000), option(2000)],
    };
    expect(fromPrice({ pricePaisa: 45000, optionGroups: [size, sauces] })).toBe(45000 + 10000 + 1000 + 2000);
  });
});
