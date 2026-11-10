import Link from 'next/link';
import { BikeIcon } from '@/components/icons';
import type { RestaurantResult } from '@/lib/api/types';
import { cuisineLabel } from '@/lib/cuisines';
import { clockTime, deliveryWindow, rupees } from '@/lib/format';
import { Cover } from './Cover';
import { RatingLabel } from './RatingLabel';

/** Why the restaurant can't take an order right now, if it can't. */
function closedReason(r: RestaurantResult): string | null {
  if (r.pausedUntil) return `Busy until ${clockTime(r.pausedUntil)}`;
  if (!r.openNow) return 'Closed now';
  return null;
}

export function RestaurantCard({ restaurant: r }: { restaurant: RestaurantResult }) {
  const closed = closedReason(r);
  return (
    <Link href={`/restaurant/${r.id}`} className="group block">
      <div className="relative overflow-hidden rounded-lg">
        <Cover
          name={r.name}
          url={r.coverUrl}
          cuisine={r.cuisines[0]}
          className={`aspect-[16/9] w-full transition-transform duration-300 group-hover:scale-105 ${closed ? 'grayscale' : ''}`}
        />
        {closed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-ink">{closed}</span>
          </div>
        ) : (
          <span className="absolute bottom-2 left-2 rounded-full bg-white px-2.5 py-1 text-xs font-bold shadow">
            {deliveryWindow(r.delivery.deliveryTimeMinutes)}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-0.5 text-sm">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-bold group-hover:text-brand-600">{r.name}</h3>
          <RatingLabel rating={r.rating} />
        </div>
        <p className="truncate text-muted">{r.cuisines.map(cuisineLabel).join(' · ')}</p>
        <p className="flex items-center gap-1 text-muted">
          <BikeIcon className="size-4" />
          {r.delivery.deliveryFeePaisa === 0 ? (
            <span className="font-semibold text-brand-600">Free delivery</span>
          ) : (
            rupees(r.delivery.deliveryFeePaisa)
          )}
        </p>
        {r.matchingDishes.length > 0 && (
          <p className="truncate text-xs text-muted">
            Has{' '}
            {r.matchingDishes
              .slice(0, 2)
              .map((d) => d.name)
              .join(', ')}
          </p>
        )}
      </div>
    </Link>
  );
}
