import type { Metadata } from 'next';
import { ZoneForm } from '@/components/vendor/ZoneForm';
import { ZoneMap } from '@/components/vendor/ZoneMap';
import { rupeesField } from '@/lib/amount';
import { restaurantZones } from '@/lib/api/restaurants';
import { deliveryWindow, rupees } from '@/lib/format';
import { requireOwner } from '@/lib/owner';
import { radiusKm, zoneReach } from '@/lib/zones';
import { removeZone, saveZone } from '../../settings-actions';

export const metadata: Metadata = { title: 'Delivery zones' };

/** Up to 10 zones restaurant-service allows. */
const MAX_ZONES = 10;

export default async function DeliveryZones({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { token, restaurant } = await requireOwner(restaurantId);
  const zones = await restaurantZones(token, restaurant.id);
  const center = restaurant.location;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Delivery zones</h1>
        <p className="text-sm text-muted">
          Where you deliver and on what terms. Where zones overlap, a customer gets the cheapest one that reaches them,
          so a small cheap zone inside a wider dearer one works.
        </p>
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[1fr_auto]">
        <section className="rounded-xl bg-white shadow-sm">
          {zones.length === 0 ? (
            <p className="p-6 text-sm text-muted">
              No zones yet: customers can't order until you add one, and FoodKoala can't approve the restaurant without
              one.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {zones.map((z) => {
                const km = radiusKm(z.area, center);
                return (
                  <li key={z.id} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-bold">
                        {z.name} <span className="font-normal text-muted">· {zoneReach(z, center)}</span>
                      </span>
                      <span className="text-sm text-muted">
                        {z.deliveryFeePaisa ? rupees(z.deliveryFeePaisa) : 'Free'} delivery ·{' '}
                        {rupees(z.minimumOrderPaisa)} minimum · {deliveryWindow(z.deliveryTimeMinutes)}
                      </span>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-brand-700">Change</summary>
                      <div className="mt-3 space-y-3">
                        <ZoneForm
                          action={saveZone.bind(null, restaurant.id, z.id)}
                          submitLabel="Save zone"
                          customArea={km === null}
                          defaults={{
                            name: z.name,
                            radiusKm: km === null ? '' : String(km),
                            fee: rupeesField(z.deliveryFeePaisa),
                            minimum: rupeesField(z.minimumOrderPaisa),
                            time: String(z.deliveryTimeMinutes),
                          }}
                        />
                        <form action={removeZone.bind(null, restaurant.id, z.id)}>
                          <button type="submit" className="text-sm font-semibold text-red-700">
                            Delete zone
                          </button>
                        </form>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <ZoneMap zones={zones} center={center} />
      </div>

      {zones.length < MAX_ZONES && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold">Add a zone</h2>
          <ZoneForm
            action={saveZone.bind(null, restaurant.id, null)}
            submitLabel="Add zone"
            defaults={{ name: '', radiusKm: '', fee: '0', minimum: '0', time: '30' }}
          />
        </section>
      )}
    </div>
  );
}
