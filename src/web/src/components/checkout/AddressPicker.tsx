import Link from 'next/link';
import { addAddress } from '@/app/(shop)/checkout/actions';
import { PinIcon } from '@/components/icons';
import { addressLine, addressTitle, areaAndCity } from '@/lib/addresses';
import type { Address } from '@/lib/api/types';
import { type CheckoutChoices, checkoutHref } from '@/lib/checkout';
import type { DeliveryLocation } from '@/lib/location';
import { AddressFields } from './AddressFields';

/** Saved addresses as cards to pick (links, so the page re-prices on the server), and a form for a new one. */
export function AddressPicker({
  addresses,
  choices,
  selectedId,
  location,
}: {
  addresses: Address[];
  choices: CheckoutChoices;
  selectedId: string | undefined;
  location: DeliveryLocation | null;
}) {
  const start = location ? areaAndCity(location.label) : { area: '', city: '' };
  return (
    <div className="space-y-3">
      {addresses.map((a) => {
        const selected = a.id === selectedId;
        return (
          <Link
            key={a.id}
            href={checkoutHref(choices, { addressId: a.id })}
            aria-current={selected ? 'true' : undefined}
            className={`flex gap-3 rounded-lg border p-4 ${selected ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-300'}`}
          >
            <PinIcon className={`size-5 shrink-0 ${selected ? 'text-brand-600' : 'text-muted'}`} />
            <div className="text-sm">
              <p className="font-bold">{addressTitle(a)}</p>
              <p className="text-muted">{addressLine(a)}</p>
              {a.landmark && <p className="text-muted">{a.landmark}</p>}
            </div>
          </Link>
        );
      })}

      <details open={addresses.length === 0} className="rounded-lg border border-dashed border-brand-300 p-4">
        <summary className="cursor-pointer font-bold text-brand-600">+ Add a new address</summary>
        {location ? (
          <form action={addAddress} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="choices" value={checkoutHref(choices, {}).split('?')[1] ?? ''} />
            <p className="text-xs text-muted sm:col-span-2">
              The pin starts at <span className="font-semibold text-ink">{location.label}</span>.{' '}
              <Link href="/" className="font-semibold text-brand-600 hover:underline">
                Change
              </Link>
            </p>
            <AddressFields start={start} pin={location} />
            <button
              type="submit"
              className="h-11 rounded-lg bg-brand-600 font-bold text-white hover:bg-brand-700 sm:col-span-2"
            >
              Save address
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm">
            <Link href="/" className="font-semibold text-brand-600 hover:underline">
              Choose your area
            </Link>{' '}
            first, so the rider knows where to go.
          </p>
        )}
      </details>
    </div>
  );
}
