'use client';

import { useActionState } from 'react';
import type { AccountState } from '@/app/(shop)/account/actions';
import { AddressFields } from '@/components/checkout/AddressFields';

type Action = (prev: AccountState, form: FormData) => Promise<AccountState>;

/** A new address at the area the customer chose, the same fields checkout asks for. */
export function AddAddressForm({ action, start }: { action: Action; start: { area: string; city: string } }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <AddressFields start={start} />
      {state.error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-brand-600 font-bold text-white hover:bg-brand-700 disabled:opacity-50 sm:col-span-2"
      >
        Save address
      </button>
    </form>
  );
}
