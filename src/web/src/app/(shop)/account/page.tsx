import type { Metadata } from 'next';
import Link from 'next/link';
import { AddAddressForm } from '@/components/account/AddAddressForm';
import { FavouriteButton } from '@/components/account/FavouriteButton';
import { ProfileForm } from '@/components/account/ProfileForm';
import { Section } from '@/components/checkout/Section';
import { StatusBadge } from '@/components/console/StatusBadge';
import { Cover } from '@/components/restaurants/Cover';
import { addressLine, addressTitle, areaAndCity } from '@/lib/addresses';
import { myAddresses, myFavourites, myProfile } from '@/lib/api/users';
import { currentLocation } from '@/lib/current-location';
import { formatPhone } from '@/lib/phone';
import { accessToken, requireUser } from '@/lib/session';
import { addAccountAddress, makeDefault, removeAddress, saveProfile } from './actions';

export const metadata: Metadata = { title: 'Your account' };

const small = 'rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-canvas';

/** The customer's details, saved addresses and favourite restaurants. */
export default async function Account() {
  await requireUser('/account');
  const token = (await accessToken())!;
  const [profile, addresses, favourites, location] = await Promise.all([
    myProfile(token),
    myAddresses(token),
    myFavourites(token),
    currentLocation(),
  ]);

  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-extrabold">Your account</h1>
          <p className="text-sm text-muted">Signed in with {formatPhone(profile.phone)}</p>
        </div>

        <Section title="Your details">
          <ProfileForm action={saveProfile} profile={profile} />
        </Section>

        <Section title="Saved addresses">
          {addresses.length === 0 && <p className="text-sm text-muted">None yet: you can save one at checkout too.</p>}
          <ul className="divide-y divide-line">
            {addresses.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-bold">
                    {addressTitle(a)} {a.isDefault && <StatusBadge label="Default" tone="good" />}
                  </p>
                  <p className="text-muted">{addressLine(a)}</p>
                  {a.landmark && <p className="text-muted">{a.landmark}</p>}
                </div>
                {!a.isDefault && (
                  <form action={makeDefault.bind(null, a.id)}>
                    <button type="submit" className={small}>
                      Make default
                    </button>
                  </form>
                )}
                <form action={removeAddress.bind(null, a.id)}>
                  <button type="submit" className={`${small} text-red-700`}>
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <details className="mt-3 rounded-lg border border-dashed border-brand-300 p-4">
            <summary className="cursor-pointer font-bold text-brand-600">+ Add an address</summary>
            {location ? (
              <>
                <p className="mt-3 text-xs text-muted">
                  The rider is sent to <span className="font-semibold text-ink">{location.label}</span>.{' '}
                  <Link href="/" className="font-semibold text-brand-600 hover:underline">
                    Change
                  </Link>
                </p>
                <AddAddressForm action={addAccountAddress} start={areaAndCity(location.label)} />
              </>
            ) : (
              <p className="mt-3 text-sm">
                <Link href="/" className="font-semibold text-brand-600 hover:underline">
                  Choose your area
                </Link>{' '}
                first, so the rider knows where to go.
              </p>
            )}
          </details>
        </Section>

        <Section title="Favourite restaurants">
          {favourites.length === 0 ? (
            <p className="text-sm text-muted">Tap the heart on a restaurant to keep it here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {favourites.map((f) => (
                <li key={f.restaurantId} className="flex items-center gap-3 py-3">
                  {f.restaurant ? (
                    <Link href={`/restaurant/${f.restaurantId}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Cover
                        name={f.restaurant.name}
                        url={f.restaurant.logoUrl}
                        cuisine={f.restaurant.cuisines[0]}
                        className="size-12 shrink-0 rounded-lg text-xl"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{f.restaurant.name}</span>
                        <span className="text-sm text-muted">
                          {f.restaurant.address.area} · {f.restaurant.acceptingOrders ? 'Taking orders' : 'Closed now'}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <span className="flex-1 text-sm text-muted">Not on FoodKoala right now</span>
                  )}
                  <FavouriteButton restaurantId={f.restaurantId} favourite />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
