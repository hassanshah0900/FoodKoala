import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/checkout/Section';
import { ItemForm } from '@/components/vendor/ItemForm';
import { freshMenu } from '@/lib/api/menus';
import { requireOwner } from '@/lib/owner';
import { one, type Params } from '@/lib/params';
import { saveItem } from '../../../menu-actions';

export const metadata: Metadata = { title: 'New item' };

export default async function NewItem({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<Params>;
}) {
  const { restaurantId } = await params;
  const { token, restaurant } = await requireOwner(restaurantId);
  const { categories } = await freshMenu(token, restaurant.id);
  const wanted = one((await searchParams).category);
  const category = categories.find((c) => c.id === wanted) ?? categories[0];
  if (!category) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/vendor/${restaurant.id}/menu`} className="text-sm font-semibold text-brand-700">
        ← Menu
      </Link>
      <h1 className="text-2xl font-extrabold">New item in {category.name}</h1>
      <Section title="Item">
        <ItemForm
          action={saveItem.bind(null, restaurant.id, null)}
          categories={categories}
          submitLabel="Add item"
          defaults={{
            name: '',
            description: '',
            price: '',
            imageUrl: '',
            isAvailable: true,
            categoryId: category.id,
            groups: [],
          }}
        />
      </Section>
    </div>
  );
}
