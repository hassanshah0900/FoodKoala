import type { MenuItem } from './api/types';

/** The least the item can cost: its price plus the cheapest choices it requires. */
export function fromPrice(item: Pick<MenuItem, 'pricePaisa' | 'optionGroups'>): number {
  return item.optionGroups.reduce((sum, g) => {
    const cheapest = g.options
      .filter((o) => o.isAvailable)
      .map((o) => o.pricePaisa)
      .sort((a, b) => a - b)
      .slice(0, g.minSelect);
    return sum + cheapest.reduce((a, b) => a + b, 0);
  }, item.pricePaisa);
}
