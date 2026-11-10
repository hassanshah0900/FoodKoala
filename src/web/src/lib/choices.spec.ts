import { groupRule, toggle, unitPrice, unmetGroups } from './choices';

const option = (id: string, pricePaisa = 0, isAvailable = true) => ({ id, name: id, pricePaisa, isAvailable });
const item = {
  pricePaisa: 45000,
  optionGroups: [
    { id: 'size', name: 'Size', minSelect: 1, maxSelect: 1, options: [option('regular'), option('large', 15000)] },
    {
      id: 'extras',
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      options: [option('cheese', 8000), option('jalapenos', 5000), option('egg', 6000), option('gone', 1, false)],
    },
  ],
};

describe('choosing options', () => {
  it('describes each rule', () => {
    expect(groupRule({ minSelect: 1, maxSelect: 1 })).toBe('Choose 1');
    expect(groupRule({ minSelect: 0, maxSelect: 3 })).toBe('Choose up to 3');
    expect(groupRule({ minSelect: 2, maxSelect: 4 })).toBe('Choose 2 to 4');
  });

  it('swaps a one-choice group like a radio button', () => {
    expect(toggle(item, 'large', ['regular', 'cheese'])).toEqual(['cheese', 'large']);
    expect(toggle(item, 'large', ['large'])).toEqual([]);
  });

  it('adds up to the maximum, removes on a second tap, and ignores unavailable options', () => {
    let s = toggle(item, 'cheese', []);
    s = toggle(item, 'jalapenos', s);
    expect(toggle(item, 'egg', s)).toEqual(['cheese', 'jalapenos']);
    expect(toggle(item, 'cheese', s)).toEqual(['jalapenos']);
    expect(toggle(item, 'gone', [])).toEqual([]);
    expect(toggle(item, 'nope', ['cheese'])).toEqual(['cheese']);
  });

  it('says which groups still need a choice', () => {
    expect(unmetGroups(item, [])).toEqual(['size']);
    expect(unmetGroups(item, ['large', 'cheese'])).toEqual([]);
  });

  it('prices the item with its options', () => expect(unitPrice(item, ['large', 'cheese'])).toBe(45000 + 15000 + 8000));
});
