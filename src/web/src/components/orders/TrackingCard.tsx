import type { Tracking } from '@/lib/api/types';
import { arrivalLine, mapPins, riderLine, staleLine, vehicleLabel } from '@/lib/tracking';
import { LiveMap } from './LiveMap';

/** The rider's card under the status: who is bringing the food, how far they are, and the map. */
export function TrackingCard({ tracking, now }: { tracking: Tracking; now: number }) {
  const arrival = arrivalLine(tracking);
  const stale = staleLine(tracking, now);
  const r = tracking.rider;
  return (
    <section className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{riderLine(tracking)}</h2>
          {arrival && <p className="text-sm text-muted">{arrival}</p>}
          {stale && <p className="text-sm text-amber-700">{stale}</p>}
        </div>
        {r && (
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <p className="font-semibold">{r.name}</p>
              <p className="text-muted">{vehicleLabel(r.vehicle)}</p>
            </div>
            <a
              href={`tel:${r.phone}`}
              className="rounded-full border border-brand-600 px-4 py-2 font-semibold text-brand-600 hover:bg-brand-50"
            >
              Call
            </a>
          </div>
        )}
      </div>
      <LiveMap pins={mapPins(tracking)} />
    </section>
  );
}
