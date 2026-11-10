'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { AgainState } from '@/app/(shop)/orders/actions';

type Action = (prev: AgainState, form: FormData) => Promise<AgainState>;

/** Puts a past order back in the cart, asking first if that means emptying another restaurant's cart. */
export function OrderAgain({ action, full = false }: { action: Action; full?: boolean }) {
  const [state, submit, pending] = useActionState(action, {});
  const button = `rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${full ? 'w-full' : ''}`;
  return (
    <div className="space-y-2">
      {state.otherRestaurant ? (
        <form action={submit} className="space-y-2 rounded-lg bg-brand-50 p-3 text-sm">
          <p>Your cart has food from another restaurant. Start a new cart with this order?</p>
          <input type="hidden" name="replace" value="true" />
          <button type="submit" disabled={pending} className={`${button} bg-brand-600 text-white`}>
            Start a new cart
          </button>
        </form>
      ) : (
        <form action={submit}>
          <button
            type="submit"
            disabled={pending}
            className={`${button} border border-brand-600 text-brand-700 hover:bg-brand-50`}
          >
            Order again
          </button>
        </form>
      )}
      {state.skipped && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>The rest is in your cart, but these couldn't be added:</p>
          <ul className="mt-1 list-disc pl-5">
            {state.skipped.map((s) => (
              <li key={s.name}>
                {s.name}: {s.reason}
              </li>
            ))}
          </ul>
          <Link href="/cart" className="mt-2 inline-block font-bold text-brand-700">
            Go to cart →
          </Link>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
