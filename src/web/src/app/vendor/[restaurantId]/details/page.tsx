import type { Metadata } from 'next';
import { Section } from '@/components/checkout/Section';
import { RestaurantForm } from '@/components/vendor/RestaurantForm';
import { requireOwner } from '@/lib/owner';
import { resubmit, saveDetails } from '../../settings-actions';

export const metadata: Metadata = { title: 'Restaurant details' };

export default async function RestaurantDetails({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { restaurant: r } = await requireOwner(restaurantId);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-extrabold">Restaurant details</h1>
      {r.status === 'rejected' && (
        <form
          action={resubmit.bind(null, r.id)}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
        >
          <span>
            FoodKoala didn't approve it: {r.statusReason}. Fix it here or in your menu, hours or zones, then ask again.
          </span>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 font-bold text-white hover:bg-brand-700">
            Ask for review again
          </button>
        </form>
      )}
      <Section title="Listing">
        <RestaurantForm
          action={saveDetails.bind(null, r.id)}
          submitLabel="Save details"
          defaults={{
            name: r.name,
            description: r.description ?? '',
            cuisines: r.cuisines,
            phone: r.phone,
            line1: r.address.line1,
            area: r.address.area,
            city: r.address.city,
            province: r.address.province,
            pin: `${r.location.lat}, ${r.location.lng}`,
            logoUrl: r.logoUrl ?? '',
            coverUrl: r.coverUrl ?? '',
          }}
        />
      </Section>
    </div>
  );
}
