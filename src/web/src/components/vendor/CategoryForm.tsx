'use client';

import { useActionState } from 'react';
import type { MenuFormState } from '@/app/vendor/menu-actions';

type Action = (prev: MenuFormState, form: FormData) => Promise<MenuFormState>;

/** A category's name and description: a new one at the end of the menu, or renaming one. */
export function CategoryForm({
  action,
  defaults,
  submitLabel,
}: {
  action: Action;
  defaults?: { name: string; description: string };
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const field = 'rounded-lg border border-line px-3 py-2 text-sm';
  return (
    <form action={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={defaults?.name}
          placeholder="Category, e.g. Biryani"
          aria-label="Category name"
          className={`${field} min-w-0 flex-1`}
        />
        <input
          name="description"
          maxLength={300}
          defaultValue={defaults?.description}
          placeholder="Description (optional)"
          aria-label="Category description"
          className={`${field} min-w-0 flex-[2]`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
      {state.errors?.map((e) => (
        <p key={e} role="alert" className="text-sm text-red-700">
          {e}
        </p>
      ))}
    </form>
  );
}
