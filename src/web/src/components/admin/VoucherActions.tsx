'use client';

import { useActionState } from 'react';
import type { VoucherChangeState } from '@/app/admin/vouchers/actions';

type Action = (prev: VoucherChangeState, form: FormData) => Promise<VoucherChangeState>;

/** Pause or resume a voucher, or change its end, total uses and description. */
export function VoucherActions({
  action,
  active,
  current,
}: {
  action: Action;
  active: boolean;
  current: { endsAt: string; usageLimit: string; description: string };
}) {
  const [state, submit, pending] = useActionState(action, {});
  const field = 'mt-1 block w-full rounded-lg border border-line px-2 py-1.5 font-normal';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={submit}>
          <button
            type="submit"
            name="active"
            value={String(!active)}
            disabled={pending}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-50 ${
              active ? 'border border-line hover:bg-canvas' : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {active ? 'Pause' : 'Resume'}
          </button>
        </form>
        <details className="group">
          <summary className="cursor-pointer list-none rounded-lg border border-line px-3 py-1.5 text-sm font-bold hover:bg-canvas">
            Change…
          </summary>
          <form action={submit} className="mt-2 w-64 space-y-2 text-sm">
            <label className="block font-semibold">
              Ends (Pakistan time)
              <input type="datetime-local" name="endsAt" required defaultValue={current.endsAt} className={field} />
            </label>
            <label className="block font-semibold">
              Total uses <span className="font-normal text-muted">empty for no limit</span>
              <input name="usageLimit" inputMode="numeric" defaultValue={current.usageLimit} className={field} />
            </label>
            <label className="block font-semibold">
              Description
              <input name="description" required maxLength={200} defaultValue={current.description} className={field} />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
          </form>
        </details>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
