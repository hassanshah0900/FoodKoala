import type { MenuItem } from './api/types';

type Group = MenuItem['optionGroups'][number];

/** What the customer is told a group needs: "Choose 1", "Choose up to 3", "Choose 2 to 4". */
export function groupRule(g: Pick<Group, 'minSelect' | 'maxSelect'>): string {
  if (g.minSelect === g.maxSelect) return `Choose ${g.minSelect}`;
  if (g.minSelect === 0) return `Choose up to ${g.maxSelect}`;
  return `Choose ${g.minSelect} to ${g.maxSelect}`;
}

/**
 * The selection after tapping an option. A one-choice group swaps its choice
 * (like a radio button); others add or remove it, never beyond maxSelect.
 */
export function toggle(item: Pick<MenuItem, 'optionGroups'>, optionId: string, selected: readonly string[]): string[] {
  const group = item.optionGroups.find((g) => g.options.some((o) => o.id === optionId));
  const option = group?.options.find((o) => o.id === optionId);
  if (!group || !option?.isAvailable) return [...selected];
  if (selected.includes(optionId)) return selected.filter((id) => id !== optionId);
  const inGroup = new Set(group.options.map((o) => o.id));
  if (group.maxSelect === 1) return [...selected.filter((id) => !inGroup.has(id)), optionId];
  return selected.filter((id) => inGroup.has(id)).length >= group.maxSelect ? [...selected] : [...selected, optionId];
}

/** Groups whose choices don't meet their rule yet, by group id. Empty when the item can go in the cart. */
export function unmetGroups(item: Pick<MenuItem, 'optionGroups'>, selected: readonly string[]): string[] {
  return item.optionGroups
    .filter((g) => {
      const n = g.options.filter((o) => selected.includes(o.id)).length;
      return n < g.minSelect || n > g.maxSelect;
    })
    .map((g) => g.id);
}

/** The item's price with the chosen options, for one. */
export function unitPrice(item: Pick<MenuItem, 'pricePaisa' | 'optionGroups'>, selected: readonly string[]): number {
  const chosen = item.optionGroups.flatMap((g) => g.options).filter((o) => selected.includes(o.id));
  return chosen.reduce((sum, o) => sum + o.pricePaisa, item.pricePaisa);
}
