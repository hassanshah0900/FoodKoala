'use client';

import { useActionState } from 'react';
import type { TicketState } from '@/app/vendor/actions';
import { PREP_TIMES, REJECT_REASONS } from '@/lib/kitchen';

type Action = (prev: TicketState, form: FormData) => Promise<TicketState>;

const primary = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50';

/** What the kitchen can do with a ticket: accept or reject a new order, or say the food is ready. */
export function TicketActions({ action, status }: { action: Action; status: 'placed' | 'accepted' | 'ready' }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <div className="space-y-2">
      {status === 'placed' && (
        <>
          <form action={submit} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="to" value="accepted" />
            <label className="text-sm">
              <span className="sr-only">Ready in</span>
              <select
                name="prepTimeMinutes"
                defaultValue="20"
                className="rounded-lg border border-line bg-white px-2 py-2 text-sm"
              >
                {PREP_TIMES.map((m) => (
                  <option key={m} value={m}>
                    Ready in {m} min
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={pending} className={primary}>
              Accept
            </button>
          </form>
          <details>
            <summary className="cursor-pointer list-none text-sm font-semibold text-red-700">Can't take it…</summary>
            <form action={submit} className="mt-2 space-y-2 text-sm">
              <input type="hidden" name="to" value="rejected" />
              {REJECT_REASONS.map((r, i) => (
                <label key={r} className="flex items-center gap-2">
                  <input type="radio" name="reason" value={r} defaultChecked={i === 0} className="accent-brand-600" />
                  {r}
                </label>
              ))}
              <input
                name="ownReason"
                maxLength={500}
                placeholder="Or write your own reason"
                className="block w-full rounded-lg border border-line px-2 py-1.5"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-red-600 px-3 py-1.5 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Reject order
              </button>
            </form>
          </details>
        </>
      )}
      {status === 'accepted' && (
        <form action={submit}>
          <input type="hidden" name="to" value="ready" />
          <button type="submit" disabled={pending} className={primary}>
            Food is ready
          </button>
        </form>
      )}
      {status === 'ready' && <p className="text-sm text-muted">Waiting for the rider to pick it up.</p>}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
