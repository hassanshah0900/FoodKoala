'use client';

import { useState } from 'react';
import { type GroupDraft, newGroup } from '@/lib/menu-editing';

const input = 'block w-full rounded-lg border border-line px-2 py-1.5 text-sm';

/**
 * An item's choices: groups like "Size" (pick 1) or "Extras" (up to 3), each with
 * its options and what they add to the price. Sent with the form as JSON.
 */
export function ChoicesEditor({ initial }: { initial: GroupDraft[] }) {
  const [groups, setGroups] = useState(initial);
  const change = (i: number, g: Partial<GroupDraft>) => setGroups(groups.map((x, j) => (j === i ? { ...x, ...g } : x)));
  const changeOption = (i: number, k: number, o: Partial<GroupDraft['options'][number]>) =>
    change(i, { options: groups[i].options.map((x, j) => (j === k ? { ...x, ...o } : x)) });

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold">Choices</legend>
      <input type="hidden" name="optionGroups" value={JSON.stringify(groups)} />
      {groups.length === 0 && <p className="text-sm text-muted">No choices: customers add the item as it is.</p>}
      {groups.map((g, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: new groups have no id yet; their place is their identity while editing.
        <div key={i} className="space-y-3 rounded-lg border border-line p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <label className="text-sm font-semibold">
              Name
              <input
                value={g.name}
                onChange={(e) => change(i, { name: e.target.value })}
                placeholder="Size"
                className={input}
              />
            </label>
            <label className="text-sm font-semibold">
              Pick at least
              <input
                type="number"
                min={0}
                value={g.minSelect}
                onChange={(e) => change(i, { minSelect: Number(e.target.value) })}
                className={`${input} w-20`}
              />
            </label>
            <label className="text-sm font-semibold">
              At most
              <input
                type="number"
                min={1}
                value={g.maxSelect}
                onChange={(e) => change(i, { maxSelect: Number(e.target.value) })}
                className={`${input} w-20`}
              />
            </label>
            <button
              type="button"
              onClick={() => setGroups(groups.filter((_, j) => j !== i))}
              className="rounded-lg px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
          <ul className="space-y-2">
            {g.options.map((o, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: as above, for options.
              <li key={k} className="grid grid-cols-[1fr_6rem_auto_auto] items-center gap-2">
                <input
                  aria-label="Option"
                  value={o.name}
                  onChange={(e) => changeOption(i, k, { name: e.target.value })}
                  placeholder="Full"
                  className={input}
                />
                <input
                  aria-label="Adds (Rs)"
                  inputMode="decimal"
                  value={o.price}
                  onChange={(e) => changeOption(i, k, { price: e.target.value })}
                  className={input}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={o.isAvailable}
                    onChange={(e) => changeOption(i, k, { isAvailable: e.target.checked })}
                    className="accent-brand-600"
                  />
                  In stock
                </label>
                <button
                  type="button"
                  aria-label="Remove option"
                  disabled={g.options.length === 1}
                  onClick={() => change(i, { options: g.options.filter((_, j) => j !== k) })}
                  className="px-1 text-muted hover:text-red-700 disabled:opacity-30"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">The second box is what the option adds to the price, in rupees.</p>
          <button
            type="button"
            onClick={() => change(i, { options: [...g.options, { name: '', price: '0', isAvailable: true }] })}
            className="text-sm font-semibold text-brand-700"
          >
            + Add option
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setGroups([...groups, newGroup()])}
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-canvas"
      >
        + Add a choice (size, extras…)
      </button>
    </fieldset>
  );
}
