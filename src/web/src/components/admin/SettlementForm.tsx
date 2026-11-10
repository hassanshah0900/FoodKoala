'use client';

import { useActionState } from 'react';
import type { SettleState } from '@/app/admin/riders/actions';
import type { SettlementKind } from '@/lib/api/types';
import { SETTLEMENT_KINDS } from '@/lib/settlements';

type Action = (prev: SettleState, form: FormData) => Promise<SettleState>;

/** Records one settlement; it starts filled in with the one that clears the balance. */
export function SettlementForm({
  action,
  suggested,
}: {
  action: Action;
  suggested: { kind: SettlementKind; amount: string } | null;
}) {
  const [state, submit, pending] = useActionState(action, {});
  // After a refusal the form shows what was typed; otherwise the suggestion for the new balance.
  const shown = state.values ?? { kind: suggested?.kind ?? 'cash_deposit', amount: suggested?.amount ?? '', note: '' };
  return (
    // A new key whenever the values to show change, since defaultValue only applies when the form mounts.
    <form key={JSON.stringify(shown)} action={submit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">What happened</legend>
        {SETTLEMENT_KINDS.map((k) => (
          <label
            key={k.kind}
            className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-checked:border-brand-600 has-checked:bg-brand-50"
          >
            <input
              type="radio"
              name="kind"
              value={k.kind}
              defaultChecked={k.kind === shown.kind}
              className="mt-1 accent-brand-600"
            />
            <span>
              <span className="block text-sm font-bold">{k.label}</span>
              <span className="text-sm text-muted">{k.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block text-sm font-semibold">
        Amount (Rs)
        <input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={shown.amount}
          className="mt-1 block w-full rounded-lg border border-line px-3 py-2 font-normal"
        />
      </label>
      <label className="block text-sm font-semibold">
        Note <span className="font-normal text-muted">(optional)</span>
        <input
          name="note"
          maxLength={200}
          defaultValue={shown.note}
          placeholder="e.g. Handed in at the Gulshan office"
          className="mt-1 block w-full rounded-lg border border-line px-3 py-2 font-normal"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-sm text-green-700">
          Recorded.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Record settlement
      </button>
    </form>
  );
}
