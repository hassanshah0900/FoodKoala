'use client';

import { useActionState, useState } from 'react';
import type { VoucherFormState } from '@/app/admin/vouchers/actions';

type Action = (prev: VoucherFormState, form: FormData) => Promise<VoucherFormState>;

const input = 'mt-1 block w-full rounded-lg border border-line px-3 py-2 font-normal';
const label = 'block text-sm font-semibold';

/** A new voucher; times are Pakistan time and amounts rupees, as admins think of them. */
export function VoucherForm({
  action,
  restaurants,
  defaults,
}: {
  action: Action;
  restaurants: { id: string; name: string; area: string }[];
  defaults: { startsAt: string; endsAt: string };
}) {
  const [state, submit, pending] = useActionState(action, {});
  const v = state.values ?? {};
  const [kind, setKind] = useState(v.kind ?? 'percent');

  return (
    // Remounts after a refusal so the typed values come back (React resets a form once its action ends).
    <form key={JSON.stringify(v)} action={submit} className="space-y-5">
      {state.errors && (
        <ul role="alert" className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Code
          <input
            name="code"
            required
            pattern="[A-Za-z0-9_\-]{3,32}"
            title="3 to 32 letters, digits, - or _"
            defaultValue={v.code}
            placeholder="KOALA20"
            className={`${input} uppercase`}
          />
        </label>
        <label className={label}>
          What customers are told
          <input
            name="description"
            required
            maxLength={200}
            defaultValue={v.description}
            placeholder="20% off, up to Rs 150"
            className={input}
          />
        </label>
      </div>

      <fieldset>
        <legend className={label}>Discount</legend>
        <div className="mt-2 flex gap-2">
          {[
            ['percent', 'Percent off'],
            ['flat', 'Rupees off'],
          ].map(([value, text]) => (
            <label
              key={value}
              className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-700"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          {kind === 'percent' ? 'Percent off' : 'Rupees off'}
          <input name="value" required inputMode="decimal" defaultValue={v.value} className={input} />
        </label>
        {kind === 'percent' && (
          <label className={label}>
            Up to (Rs) <span className="font-normal text-muted">optional</span>
            <input name="maxDiscount" inputMode="decimal" defaultValue={v.maxDiscount} className={input} />
          </label>
        )}
        <label className={label}>
          Minimum order (Rs)
          <input name="minSubtotal" inputMode="decimal" defaultValue={v.minSubtotal ?? '0'} className={input} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Starts (Pakistan time)
          <input
            type="datetime-local"
            name="startsAt"
            required
            defaultValue={v.startsAt ?? defaults.startsAt}
            className={input}
          />
        </label>
        <label className={label}>
          Ends
          <input
            type="datetime-local"
            name="endsAt"
            required
            defaultValue={v.endsAt ?? defaults.endsAt}
            className={input}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          Restaurant
          <select name="restaurantId" defaultValue={v.restaurantId ?? ''} className={input}>
            <option value="">Any restaurant</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}, {r.area}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Total uses <span className="font-normal text-muted">empty for no limit</span>
          <input name="usageLimit" inputMode="numeric" defaultValue={v.usageLimit} className={input} />
        </label>
        <label className={label}>
          Uses per customer
          <input
            name="perCustomerLimit"
            inputMode="numeric"
            required
            defaultValue={v.perCustomerLimit ?? '1'}
            className={input}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="firstOrderOnly"
          defaultChecked={v.firstOrderOnly === 'on'}
          className="size-4 accent-brand-600"
        />
        Only for a customer's first order
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Create voucher
      </button>
    </form>
  );
}
