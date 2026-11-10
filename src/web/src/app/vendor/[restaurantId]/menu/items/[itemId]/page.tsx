import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/checkout/Section';
import { ItemForm } from '@/components/vendor/ItemForm';
import { rupeesField } from '@/lib/amount';
import { freshMenu, getItem } from '@/lib/api/menus';
import { draftsOf } from '@/lib/menu-editing';
import { requireOwner } from '@/lib/owner';
import { isUuid } from '@/lib/params';
import { removeItem, saveItem } from '../../../../menu-actions';

export const metadata: Metadata = { title: 'Edit item' };

export default async function EditItem({ params }: { params: Promise<{ restaurantId: string; itemId: string }> }) {
  const { restaurantId, itemId } = await params;
  const { token, restaurant } = await requireOwner(restaurantId);
  if (!isUuid(itemId)) notFound();
  const [item, menu] = await Promise.all([getItem(token, itemId), freshMenu(token, restaurant.id)]);
  if (!item || item.restaurantId !== restaurant.id) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/vendor/${restaurant.id}/menu`} className="text-sm font-semibold text-brand-700">
        ← Menu
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">{item.name}</h1>
        <form action={removeItem.bind(null, restaurant.id, item.id)}>
          <button
            type="submit"
            className="rounded-lg border border-red-600 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            Delete item
          </button>
        </form>
      </div>
      <Section title="Item">
        <ItemForm
          action={saveItem.bind(null, restaurant.id, item.id)}
          categories={menu.categories}
          submitLabel="Save changes"
          defaults={{
            name: item.name,
            description: item.description ?? '',
            price: rupeesField(item.pricePaisa),
            imageUrl: item.imageUrl ?? '',
            isAvailable: item.isAvailable,
            categoryId: item.categoryId,
            groups: draftsOf(item),
          }}
        />
      </Section>
    </div>
  );
}
