'use client';

import { useActionState } from 'react';
import type { StatusAction } from '@/lib/review';
import type { StatusChangeState } from '@/lib/status-change';

type Action = (prev: StatusChangeState, form: FormData) => Promise<StatusChangeState>;

const TONES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  danger: 'border border-red-600 text-red-700 hover:bg-red-50',
  plain: 'border border-line hover:bg-canvas',
};

/**
 * One button per status change the admin can make. A change that needs a
 * reason opens a box for it first; the service's refusal shows underneath.
 */
export function StatusActions<S extends string>({ actions, action }: { actions: StatusAction<S>[]; action: Action }) {
  const [state, submit, pending] = useActionState(action, {});
  const button = (a: StatusAction<S>) => (
    <button
      type="submit"
      name="to"
      value={a.to}
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${TONES[a.tone]}`}
    >
      {a.label}
    </button>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        {actions.map((a) =>
          a.needsReason ? (
            <details key={a.to} className="group w-full">
              <summary
                className={`inline-block cursor-pointer list-none rounded-lg px-4 py-2 text-sm font-bold ${TONES[a.tone]}`}
              >
                {a.label}…
              </summary>
              <form action={submit} className="mt-2 space-y-2">
                <input type="hidden" name="needsReason" value="true" />
                <label className="block text-sm font-semibold">
                  Reason (they will see it)
                  <textarea
                    name="reason"
                    required
                    maxLength={500}
                    rows={3}
                    className="mt-1 block w-full rounded-lg border border-line p-2 font-normal"
                  />
                </label>
                {button(a)}
              </form>
            </details>
          ) : (
            <form key={a.to} action={submit}>
              {button(a)}
            </form>
          ),
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
