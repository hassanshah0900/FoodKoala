'use client';

import { useActionState } from 'react';
import { apply } from '@/app/rider/actions';
import { VEHICLES } from '@/lib/rider';

const input = 'mt-1 block w-full rounded-xl border border-line px-3 py-3 font-normal';

export function ApplyForm() {
  const [state, submit, pending] = useActionState(apply, {});
  return (
    <form action={submit} className="space-y-4">
      <label className="block font-semibold">
        Your name
        <input name="name" required minLength={2} maxLength={80} className={input} />
      </label>
      <label className="block font-semibold">
        City
        <input name="city" required minLength={2} maxLength={60} placeholder="Karachi" className={input} />
      </label>
      <fieldset>
        <legend className="font-semibold">You ride a</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {VEHICLES.map((v, i) => (
            <label
              key={v.value}
              className="cursor-pointer rounded-xl border border-line py-3 text-center font-semibold has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-700"
            >
              <input type="radio" name="vehicle" value={v.value} defaultChecked={i === 0} className="sr-only" />
              {v.label}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-brand-600 py-4 text-lg font-extrabold text-white disabled:opacity-50"
      >
        Apply to ride
      </button>
    </form>
  );
}
