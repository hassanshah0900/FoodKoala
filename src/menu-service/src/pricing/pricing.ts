import { z } from 'zod';
import type { ItemRow } from '../db/schema';

// Shapes match PriceRequest / PricedLines in contracts/openapi/menu-service.yaml.

export const priceRequestSchema = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        itemId: z.uuid(),
        quantity: z.int().min(1).max(50),
        optionIds: z
          .array(z.uuid())
          .max(50)
          .refine((ids) => new Set(ids).size === ids.length, 'optionIds repeat')
          .default([]),
      }),
    )
    .min(1)
    .max(50),
});
export type PriceRequest = z.output<typeof priceRequestSchema>;

export interface PricedLine {
  itemId: string;
  name: string;
  quantity: number;
  options: { id: string; group: string; name: string; pricePaisa: number }[];
  unitPricePaisa: number;
  lineTotalPaisa: number;
}

export interface PricedLines {
  restaurantId: string;
  lines: PricedLine[];
  subtotalPaisa: number;
}

export type PricingResult = { ok: true; value: PricedLines } | { ok: false; problems: string[] };

type MenuItem = Pick<ItemRow, 'id' | 'name' | 'pricePaisa' | 'isAvailable' | 'optionGroups'>;

const choose = (min: number, max: number) => (min === max ? `${min}` : `${min} to ${max}`);

/**
 * Checks each line against the restaurant's items and prices it. `menu` holds
 * the restaurant's items by id; anything else is "not on this menu".
 */
export function priceLines(restaurantId: string, { lines }: PriceRequest, menu: Map<string, MenuItem>): PricingResult {
  const problems: string[] = [];
  const priced: PricedLine[] = [];

  for (const [i, line] of lines.entries()) {
    const at = `lines[${i}]`;
    const item = menu.get(line.itemId);
    if (!item) {
      problems.push(`${at}: item ${line.itemId} is not on this menu`);
      continue;
    }
    if (!item.isAvailable) problems.push(`${at}: ${item.name} is sold out`);

    const chosen = new Set(line.optionIds);
    const options: PricedLine['options'] = [];
    for (const group of item.optionGroups) {
      const picked = group.options.filter((o) => chosen.has(o.id));
      for (const o of picked) chosen.delete(o.id);
      if (picked.length < group.minSelect || picked.length > group.maxSelect) {
        problems.push(`${at}: choose ${choose(group.minSelect, group.maxSelect)} in "${group.name}"`);
      }
      for (const o of picked) {
        if (!o.isAvailable) problems.push(`${at}: ${o.name} is sold out`);
        options.push({ id: o.id, group: group.name, name: o.name, pricePaisa: o.pricePaisa });
      }
    }
    for (const unknown of chosen) problems.push(`${at}: option ${unknown} is not a choice of ${item.name}`);

    const unitPricePaisa = item.pricePaisa + options.reduce((sum, o) => sum + o.pricePaisa, 0);
    priced.push({
      itemId: item.id,
      name: item.name,
      quantity: line.quantity,
      options,
      unitPricePaisa,
      lineTotalPaisa: unitPricePaisa * line.quantity,
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: { restaurantId, lines: priced, subtotalPaisa: priced.reduce((sum, l) => sum + l.lineTotalPaisa, 0) },
  };
}
