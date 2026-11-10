import type { Metadata } from 'next';
import Link from 'next/link';
import { Section } from '@/components/checkout/Section';
import { Logo } from '@/components/Logo';
import { RestaurantForm } from '@/components/vendor/RestaurantForm';
import { ownRestaurants } from '@/lib/owner';
import { applyAction } from '../settings-actions';

export const metadata: Metadata = { title: 'List your restaurant' };

/** A restaurant applies to be listed; FoodKoala reviews it once its menu, hours and zones are in. */
export default async function ListYourRestaurant() {
  const { restaurants } = await ownRestaurants('/vendor/new');
  return (
    <div className="flex-1 bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Logo />
          {restaurants.length > 0 && (
            <Link href={`/vendor/${restaurants[0].id}`} className="text-sm font-semibold text-brand-700">
              Back to your restaurant
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-extrabold">List your restaurant on FoodKoala</h1>
          <p className="mt-2 text-muted">
            Tell us about it. Next you add your menu, opening hours and where you deliver; then FoodKoala reviews it,
            usually within a day, and customers can order.
          </p>
        </div>
        <Section title="Your restaurant">
          <RestaurantForm
            action={applyAction}
            submitLabel="Apply to list it"
            defaults={{
              name: '',
              description: '',
              cuisines: [],
              phone: '',
              line1: '',
              area: '',
              city: '',
              province: '',
              pin: '',
              logoUrl: '',
              coverUrl: '',
            }}
          />
        </Section>
      </main>
    </div>
  );
}
