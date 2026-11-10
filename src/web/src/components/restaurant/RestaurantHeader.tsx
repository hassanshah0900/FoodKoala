import Link from 'next/link';
import { BikeIcon, ChevronRightIcon, ClockIcon, MapIcon } from '@/components/icons';
import { Cover } from '@/components/restaurants/Cover';
import { RatingLabel } from '@/components/restaurants/RatingLabel';
import type { DeliveryQuote, Restaurant } from '@/lib/api/types';
import { cuisineLabel } from '@/lib/cuisines';
import { clockTime, deliveryWindow, distance, rupees } from '@/lib/format';
import type { DeliveryLocation } from '@/lib/location';

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-sm">
      {icon}
      {children}
    </span>
  );
}

/** Delivery terms to the customer's location, or why there are none. */
function DeliveryFacts({ quote, location }: { quote: DeliveryQuote | null; location: DeliveryLocation | null }) {
  if (!location)
    return (
      <Link href="/" className="text-sm font-semibold text-brand-600 hover:underline">
        Choose your area to see delivery time and fee
      </Link>
    );
  if (!quote?.deliverable || !quote.delivery)
    return <p className="text-sm font-semibold text-red-700">Doesn't deliver to {location.label}</p>;
  const d = quote.delivery;
  return (
    <div className="flex flex-wrap gap-2">
      <Fact icon={<ClockIcon className="size-4 text-brand-600" />}>{deliveryWindow(d.deliveryTimeMinutes)}</Fact>
      <Fact icon={<BikeIcon className="size-4 text-brand-600" />}>
        {d.deliveryFeePaisa === 0 ? 'Free delivery' : `${rupees(d.deliveryFeePaisa)} delivery`}
      </Fact>
      <Fact icon={<MapIcon className="size-4 text-brand-600" />}>{distance(quote.distanceMeters)} away</Fact>
      <Fact icon={null}>Min. order {rupees(d.minimumOrderPaisa)}</Fact>
    </div>
  );
}

function StatusBanner({ restaurant: r }: { restaurant: Restaurant }) {
  const message = r.pausedUntil
    ? `${r.name} is busy and takes orders again at ${clockTime(r.pausedUntil)}.`
    : !r.openNow
      ? `${r.name} is closed right now. You can still look through the menu.`
      : null;
  if (!message) return null;
  return <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800">{message}</p>;
}

export function RestaurantHeader(props: {
  restaurant: Restaurant;
  quote: DeliveryQuote | null;
  location: DeliveryLocation | null;
}) {
  const { restaurant: r } = props;
  return (
    <div className="space-y-4 pt-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted">
        <Link href="/restaurants" className="hover:text-brand-600">
          Restaurants
        </Link>
        <ChevronRightIcon className="size-3" />
        <span>{r.address.city}</span>
        <ChevronRightIcon className="size-3" />
        <span className="truncate text-ink">{r.name}</span>
      </nav>
      <div className="flex items-start gap-5">
        <Cover
          name={r.name}
          url={r.logoUrl}
          cuisine={r.cuisines[0]}
          className="size-24 shrink-0 rounded-xl text-4xl md:size-28"
        />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted">{r.cuisines.map(cuisineLabel).join(' · ')}</p>
          <h1 className="text-3xl font-extrabold md:text-4xl">{r.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <RatingLabel rating={r.rating} />
            <span className="text-muted">
              {r.address.area}, {r.address.city}
            </span>
          </div>
        </div>
      </div>
      {r.description && <p className="max-w-3xl text-sm text-muted">{r.description}</p>}
      <DeliveryFacts quote={props.quote} location={props.location} />
      <StatusBanner restaurant={r} />
    </div>
  );
}
