'use client';

import { useActionState } from 'react';
import type { AccountState } from '@/app/(shop)/account/actions';
import type { Profile } from '@/lib/api/types';

type Action = (prev: AccountState, form: FormData) => Promise<AccountState>;

const input = 'mt-1 block w-full rounded-lg border border-line px-3 py-2 font-normal';

export function ProfileForm({ action, profile }: { action: Action; profile: Profile }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">
        Name
        <input name="name" maxLength={100} defaultValue={profile.name ?? ''} className={input} />
      </label>
      <label className="block text-sm font-semibold">
        Email <span className="font-normal text-muted">optional, for receipts</span>
        <input name="email" type="email" maxLength={254} defaultValue={profile.email ?? ''} className={input} />
      </label>
      <label className="block text-sm font-semibold">
        Language for texts
        <select name="preferredLanguage" defaultValue={profile.preferredLanguage} className={input}>
          <option value="en">English</option>
          <option value="ur">اردو (Urdu)</option>
        </select>
      </label>
      <div className="flex items-end gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save
        </button>
        {state.saved && !state.error && (
          <p role="status" className="pb-2.5 text-sm text-green-700">
            Saved.
          </p>
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
