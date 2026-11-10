import type { Metadata } from 'next';
import { HoursEditor } from '@/components/vendor/HoursEditor';
import { draftOf } from '@/lib/hours-editing';
import { requireOwner } from '@/lib/owner';
import { saveHours } from '../../settings-actions';

export const metadata: Metadata = { title: 'Opening hours' };

export default async function OpeningHours({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { restaurant } = await requireOwner(restaurantId);
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Opening hours</h1>
        <p className="text-sm text-muted">Pakistan time. Customers can order only while you are open.</p>
      </div>
      <HoursEditor action={saveHours.bind(null, restaurant.id)} initial={draftOf(restaurant.hours)} />
    </div>
  );
}
