'use client';

import { useActionState } from 'react';
import type { MenuFormState } from '@/app/vendor/menu-actions';
import type { GroupDraft } from '@/lib/menu-editing';
import { ChoicesEditor } from './ChoicesEditor';

type Action = (prev: MenuFormState, form: FormData) => Promise<MenuFormState>;

const input = 'mt-1 block w-full rounded-lg border border-line px-3 py-2 font-normal';
const label = 'block text-sm font-semibold';

export interface ItemDefaults {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  isAvailable: boolean;
  categoryId: string;
  groups: GroupDraft[];
}

/** A dish: its name, price, category, photo and choices. */
export function ItemForm({
  action,
  categories,
  defaults,
  submitLabel,
}: {
  action: Action;
  categories: { id: string; name: string }[];
  defaults: ItemDefaults;
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const v = state.values;
  const groups = v?.optionGroups ? (JSON.parse(v.optionGroups) as GroupDraft[]) : defaults.groups;
  return (
    // Remounts after a refusal so what was typed comes back (React resets a form once its action ends).
    <form key={JSON.stringify(v ?? {})} action={submit} className="space-y-5">
      {state.errors && (
        <ul role="alert" className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <input type="hidden" name="currentCategoryId" value={defaults.categoryId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <label className={label}>
          Name
          <input name="name" required maxLength={100} defaultValue={v?.name ?? defaults.name} className={input} />
        </label>
        <label className={label}>
          Price (Rs)
          <input
            name="price"
            required
            inputMode="decimal"
            defaultValue={v?.price ?? defaults.price}
            className={input}
          />
        </label>
      </div>
      <label className={label}>
        Description <span className="font-normal text-muted">optional</span>
        <textarea
          name="description"
          maxLength={500}
          rows={2}
          defaultValue={v?.description ?? defaults.description}
          className={input}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Category
          <select name="categoryId" defaultValue={v?.categoryId ?? defaults.categoryId} className={input}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Photo link <span className="font-normal text-muted">optional, https://</span>
          <input
            name="imageUrl"
            type="url"
            defaultValue={v?.imageUrl ?? defaults.imageUrl}
            placeholder="https://…"
            className={input}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="isAvailable"
          defaultChecked={v ? v.isAvailable === 'on' : defaults.isAvailable}
          className="size-4 accent-brand-600"
        />
        In stock (customers can order it)
      </label>
      <ChoicesEditor initial={groups} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
