import { paisaFrom, rupeesField } from './amount';
import type { ItemInput } from './api/menus';
import type { MenuItem } from './api/types';

/** The list with `id` one place earlier (-1) or later (+1); unchanged at either end. */
export function moved(ids: string[], id: string, by: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** An option group as the item form edits it: prices as typed, in rupees. */
export interface GroupDraft {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id?: string; name: string; price: string; isAvailable: boolean }[];
}

export const draftsOf = (item: Pick<MenuItem, 'optionGroups'>): GroupDraft[] =>
  item.optionGroups.map((g) => ({
    id: g.id,
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: rupeesField(o.pricePaisa),
      isAvailable: o.isAvailable,
    })),
  }));

/** A new group of choices: a size to pick ("Choose 1") is the most common. */
export const newGroup = (): GroupDraft => ({
  name: '',
  minSelect: 1,
  maxSelect: 1,
  options: [{ name: '', price: '0', isAvailable: true }],
});

/**
 * The item form as menu-service's ItemCreate. Prices are typed in rupees; the
 * choices come as JSON from the group editor. Lists everything to fix at once.
 */
export function readItemForm(field: (name: string) => string): { item: ItemInput } | { errors: string[] } {
  const errors: string[] = [];
  const name = field('name').trim();
  if (!name) errors.push('Give the item a name.');
  const pricePaisa = paisaFrom(field('price'));
  if (pricePaisa === null) errors.push('Enter the price in rupees, e.g. 450.');
  const imageUrl = field('imageUrl').trim() || null;
  if (imageUrl && !/^https:\/\/\S+$/.test(imageUrl)) errors.push('A photo link must start with https://');

  let drafts: GroupDraft[] = [];
  try {
    drafts = JSON.parse(field('optionGroups') || '[]');
  } catch {
    errors.push('The choices could not be read; please try again.');
  }
  const optionGroups = drafts.map((g, i) => {
    const label = g.name.trim() || `Choice ${i + 1}`;
    if (!g.name.trim()) errors.push(`Name choice ${i + 1}, e.g. "Size".`);
    const options = g.options.map((o) => {
      const price = paisaFrom(o.price || '0');
      if (!o.name.trim()) errors.push(`${label}: every option needs a name.`);
      if (price === null) errors.push(`${label}: "${o.name}" needs a price in rupees (0 if it adds nothing).`);
      return { ...(o.id && { id: o.id }), name: o.name.trim(), pricePaisa: price ?? 0, isAvailable: o.isAvailable };
    });
    if (!(g.minSelect >= 0 && g.maxSelect >= 1 && g.minSelect <= g.maxSelect && g.maxSelect <= options.length))
      errors.push(`${label}: customers must pick between 0 and ${options.length}, the least no more than the most.`);
    return { ...(g.id && { id: g.id }), name: g.name.trim(), minSelect: g.minSelect, maxSelect: g.maxSelect, options };
  });

  if (errors.length) return { errors };
  return {
    item: {
      name,
      description: field('description').trim() || null,
      imageUrl,
      pricePaisa: pricePaisa!,
      isAvailable: field('isAvailable') === 'on',
      optionGroups,
    },
  };
}
