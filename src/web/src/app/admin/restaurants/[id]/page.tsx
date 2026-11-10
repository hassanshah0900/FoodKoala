import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusActions } from '@/components/admin/StatusActions';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Section } from '@/components/checkout/Section';
import { Cover } from '@/components/restaurants/Cover';
import { managedRestaurant, restaurantZones } from '@/lib/api/restaurants';
import { cuisineLabel } from '@/lib/cuisines';
import { deliveryWindow, rupees, shortDate } from '@/lib/format';
import { weekRows } from '@/lib/hours';
import { isUuid } from '@/lib/params';
import { formatPhone } from '@/lib/phone';
import { approvalBlockers, labelOf, RESTAURANT_STATUSES, restaurantActions } from '@/lib/review';
import { requireAdmin } from '@/lib/session';
import { changeRestaurantStatus } from '../actions';

export const metadata: Metadata = { title: 'Restaurant' };

/** Everything an admin checks before approving: details, opening hours and delivery zones. */
export default async function AdminRestaurant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token } = await requireAdmin(`/admin/restaurants/${id}`);
  if (!isUuid(id)) notFound();
  const [r, zones] = await Promise.all([managedRestaurant(token, id), restaurantZones(token, id)]);
  if (!r) notFound();
  const status = labelOf(RESTAURANT_STATUSES, r.status);
  const blockers = r.status === 'pending' ? approvalBlockers(r.hours, zones.length) : [];

  return (
    <div className="space-y-6">
      <Link href={`/admin/restaurants?status=${r.status}`} className="text-sm font-semibold text-brand-700">
        ← {status.label}
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <Cover name={r.name} url={r.logoUrl} cuisine={r.cuisines[0]} className="size-16 rounded-xl text-3xl" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{r.name}</h1>
          <p className="text-muted">{r.cuisines.map(cuisineLabel).join(' · ')}</p>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section title="Details">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted">Address</dt>
              <dd>
                {r.address.line1}, {r.address.area}, {r.address.city}
              </dd>
              <dt className="text-muted">Province</dt>
              <dd className="capitalize">{r.address.province.replaceAll('_', ' ')}</dd>
              <dt className="text-muted">Phone</dt>
              <dd>{formatPhone(r.phone)}</dd>
              <dt className="text-muted">Applied</dt>
              <dd>{shortDate(r.createdAt)}</dd>
              {r.description && (
                <>
                  <dt className="text-muted">About</dt>
                  <dd>{r.description}</dd>
                </>
              )}
              {r.statusReason && (
                <>
                  <dt className="text-muted">Reason given</dt>
                  <dd>{r.statusReason}</dd>
                </>
              )}
            </dl>
          </Section>

          <Section title="Opening hours">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {weekRows(r.hours.weekly).map((d) => (
                  <tr key={d.day}>
                    <th scope="row" className="py-2 pr-4 text-left font-semibold">
                      {d.day}
                    </th>
                    <td className={`py-2 ${d.hours === 'Closed' ? 'text-muted' : ''}`}>{d.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Delivery zones">
            {zones.length === 0 ? (
              <p className="text-sm text-muted">No zones drawn yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {zones.map((z) => (
                  <li key={z.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-semibold">{z.name}</span>
                    <span className="text-muted">
                      {rupees(z.deliveryFeePaisa)} delivery · {rupees(z.minimumOrderPaisa)} minimum ·{' '}
                      {deliveryWindow(z.deliveryTimeMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Decision">
          {blockers.length > 0 && (
            <ul className="mb-4 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {blockers.map((b) => (
                <li key={b}>{b}: the owner has to add it before it can be approved.</li>
              ))}
            </ul>
          )}
          <StatusActions actions={restaurantActions(r.status)} action={changeRestaurantStatus.bind(null, r.id)} />
        </Section>
      </div>
    </div>
  );
}
