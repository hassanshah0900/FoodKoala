'use client';

import { useActionState } from 'react';
import type { SettingsState } from '@/app/vendor/settings-actions';

type Action = (prev: SettingsState, form: FormData) => Promise<SettingsState>;

export interface ZoneDefaults {
  name: string;
  /** Empty for a zone drawn some other way: left empty, its area is kept. */
  radiusKm: string;
  fee: string;
  minimum: string;
  time: string;
}

const field = 'mt-1 block w-full rounded-lg border border-line px-2 py-1.5 text-sm font-normal';
const label = 'block text-sm font-semibold';

/** A zone's reach and terms: how far, what delivery costs, the minimum order, and how long it takes. */
export function ZoneForm({
  action,
  defaults,
  submitLabel,
  customArea = false,
}: {
  action: Action;
  defaults: ZoneDefaults;
  submitLabel: string;
  customArea?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const v = state.values ?? {};
  return (
    <form key={JSON.stringify(v)} action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-5">
        <label className={`${label} sm:col-span-2`}>
          Name
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={v.name ?? defaults.name}
            placeholder="Nearby"
            className={field}
          />
        </label>
        <label className={label}>
          Within (km)
          <input
            name="radiusKm"
            inputMode="decimal"
            required={!customArea}
            defaultValue={v.radiusKm ?? defaults.radiusKm}
            placeholder={customArea ? 'keep area' : '3'}
            className={field}
          />
        </label>
        <label className={label}>
          Delivery (Rs)
          <input name="fee" inputMode="decimal" defaultValue={v.fee ?? defaults.fee} className={field} />
        </label>
        <label className={label}>
          Minimum (Rs)
          <input name="minimum" inputMode="decimal" defaultValue={v.minimum ?? defaults.minimum} className={field} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          Delivery takes (min)
          <input
            name="time"
            type="number"
            min={5}
            max={180}
            required
            defaultValue={v.time ?? defaults.time}
            className={`${field} w-28`}
          />
        </label>
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
