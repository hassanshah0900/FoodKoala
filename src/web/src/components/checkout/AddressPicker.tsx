import Link from 'next/link';
import { addAddress } from '@/app/(shop)/checkout/actions';
import { PinIcon } from '@/components/icons';
import { addressLine, addressTitle, areaAndCity } from '@/lib/addresses';
import type { Address } from '@/lib/api/types';
import { type CheckoutChoices, checkoutHref } from '@/lib/checkout';
import type { DeliveryLocation } from '@/lib/location';

const field = 'h-11 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand-600';

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
              The rider is sent to <span className="font-semibold text-ink">{location.label}</span>.{' '}
              <Link href="/" className="font-semibold text-brand-600 hover:underline">
                Change
              </Link>
            </p>
            <fieldset className="flex gap-2 sm:col-span-2">
              <legend className="sr-only">Label</legend>
              {(['home', 'work', 'other'] as const).map((l, i) => (
                <label
                  key={l}
                  className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-sm font-semibold capitalize has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-700"
                >
                  <input type="radio" name="label" value={l} defaultChecked={i === 0} className="sr-only" />
                  {l}
                </label>
              ))}
            </fieldset>
            <input
              name="labelText"
              maxLength={40}
              placeholder="Name for an “other” address"
              className={`${field} sm:col-span-2`}
            />
            <input
              name="line1"
              required
              maxLength={200}
              placeholder="House, flat and street"
              className={`${field} sm:col-span-2`}
            />
            <input
              name="area"
              required
              maxLength={100}
              defaultValue={start.area}
              placeholder="Area"
              className={field}
            />
            <input name="city" required maxLength={60} defaultValue={start.city} placeholder="City" className={field} />
            <input
              name="landmark"
              maxLength={200}
              placeholder="Landmark (optional)"
              className={`${field} sm:col-span-2`}
            />
            <input
              name="instructions"
              maxLength={300}
              placeholder="Note for the rider (optional)"
              className={`${field} sm:col-span-2`}
            />
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
