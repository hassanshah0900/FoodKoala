'use client';

import { useActionState } from 'react';
import { type PlaceOrderState, submitOrder } from '@/app/(shop)/checkout/actions';
import { CashIcon } from '@/components/icons';
import { rupees } from '@/lib/format';

/** Payment, a note for the restaurant and the button. Everything priced comes in as hidden fields. */
export function PlaceOrderForm(props: {
  orderKey: string;
  addressId: string | undefined;
  voucher: string | null;
  tipPaisa: number;
  /** The time it is scheduled for (ISO) and how to say it; null for as soon as possible. */
  scheduledFor: string | null;
  scheduledLabel: string | null;
  totalPaisa: number;
  blocked: string | null;
}) {
  const [state, action, pending] = useActionState(submitOrder, { errors: [] } as PlaceOrderState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="key" value={props.orderKey} />
      <input type="hidden" name="addressId" value={props.addressId ?? ''} />
      <input type="hidden" name="voucher" value={props.voucher ?? ''} />
      <input type="hidden" name="tip" value={props.tipPaisa} />
      <input type="hidden" name="scheduledFor" value={props.scheduledFor ?? ''} />
      <div className="flex items-center gap-3 rounded-lg border border-brand-600 bg-brand-50 p-4">
        <CashIcon className="size-6 text-brand-600" />
        <div className="text-sm">
          <p className="font-bold">Cash on delivery</p>
          <p className="text-muted">Pay the rider {rupees(props.totalPaisa)} at your door.</p>
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-bold">Note for the restaurant</span>
        <textarea
          name="note"
          maxLength={500}
          rows={2}
          placeholder="e.g. no cutlery please"
          className="mt-2 w-full resize-none rounded-lg border border-line p-3 text-sm outline-none focus:border-brand-600"
        />
      </label>
      {(props.blocked || state.errors.length > 0) && (
        <ul role="alert" className="space-y-1 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {props.blocked && <li>{props.blocked}</li>}
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        disabled={pending || props.blocked !== null}
        className="h-12 w-full rounded-lg bg-brand-600 font-bold text-white hover:bg-brand-700 disabled:bg-neutral-300"
      >
        {pending
          ? 'Placing your order…'
          : props.scheduledLabel
            ? `Schedule for ${props.scheduledLabel} · ${rupees(props.totalPaisa)}`
            : `Place order · ${rupees(props.totalPaisa)}`}
      </button>
    </form>
  );
}
