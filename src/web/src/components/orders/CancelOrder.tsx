'use client';

import { useActionState, useState } from 'react';
import type { CancelState } from '@/app/(shop)/orders/actions';

type Action = (prev: CancelState, form: FormData) => Promise<CancelState>;

/** "Cancel order", then "Yes, cancel it" on the same spot, so one stray tap doesn't call it off. */
export function CancelOrder({ action }: { action: Action }) {
  const [state, submit, pending] = useActionState(action, {});
  const [sure, setSure] = useState(false);
  return (
    <div className="space-y-2">
      {sure ? (
        <form action={submit} className="flex flex-wrap items-center gap-2 text-sm">
          <span>Cancel this order?</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            Yes, cancel it
          </button>
          <button type="button" onClick={() => setSure(false)} className="px-2 py-2 font-semibold text-muted">
            Keep it
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setSure(true)}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-red-700 hover:border-red-700"
        >
          Cancel order
        </button>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
