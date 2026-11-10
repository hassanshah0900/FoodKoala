import Link from 'next/link';
import type { VoucherDiscount } from '@/lib/api/types';
import { type CheckoutChoices, checkoutHref } from '@/lib/checkout';
import { rupees } from '@/lib/format';

/** A GET form: the code goes into the URL and the server checks it against the cart. */
export function VoucherBox({
  choices,
  applied,
  error,
}: {
  choices: CheckoutChoices;
  applied: VoucherDiscount | null;
  error: string | null;
}) {
  if (applied)
    return (
      <div className="flex items-center justify-between rounded-lg bg-brand-50 p-4 text-sm">
        <div>
          <p className="font-bold text-brand-700">{applied.code}</p>
          <p className="text-muted">
            {applied.description} · −{rupees(applied.discountPaisa)}
          </p>
        </div>
        <Link
          href={checkoutHref(choices, { voucher: undefined })}
          className="font-semibold text-brand-600 hover:underline"
        >
          Remove
        </Link>
      </div>
    );
  return (
    <form action="/checkout" className="space-y-2">
      {choices.addressId && <input type="hidden" name="address" value={choices.addressId} />}
      {choices.tipPaisa > 0 && <input type="hidden" name="tip" value={choices.tipPaisa} />}
      <div className="flex gap-2">
        <input
          name="voucher"
          defaultValue={choices.voucher}
          maxLength={32}
          placeholder="Enter a voucher code"
          aria-label="Voucher code"
          className="h-11 flex-1 rounded-lg border border-line px-3 text-sm uppercase outline-none focus:border-brand-600"
        />
        <button
          type="submit"
          className="rounded-lg border border-brand-600 px-5 font-bold text-brand-600 hover:bg-brand-50"
        >
          Apply
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
