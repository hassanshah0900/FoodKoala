import type { Metadata } from 'next';
import Link from 'next/link';
import { StatusBadge } from '@/components/console/StatusBadge';
import { Cover } from '@/components/restaurants/Cover';
import { CategoryForm } from '@/components/vendor/CategoryForm';
import { freshMenu } from '@/lib/api/menus';
import { rupees } from '@/lib/format';
import { fromPrice } from '@/lib/menu';
import { requireOwner } from '@/lib/owner';
import {
  addCategoryAction,
  moveCategory,
  moveItem,
  removeCategory,
  renameCategory,
  setItemAvailable,
} from '../../menu-actions';

export const metadata: Metadata = { title: 'Menu' };

const small =
  'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-canvas disabled:opacity-30';

/** The menu as the owner keeps it: sections in order, each dish with its price and whether it is in stock. */
export default async function VendorMenu({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { token, restaurant } = await requireOwner(restaurantId);
  const { categories } = await freshMenu(token, restaurant.id);
  const base = `/vendor/${restaurant.id}/menu`;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Menu</h1>
        <p className="text-sm text-muted">
          Customers see changes within a minute.{' '}
          <Link href={`/restaurant/${restaurant.id}`} className="font-semibold text-brand-700">
            See it as they do →
          </Link>
        </p>
      </div>

      {categories.map((c, ci) => (
        <section key={c.id} className="rounded-xl bg-white shadow-sm">
          <header className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{c.name}</h2>
              {c.description && <p className="text-sm text-muted">{c.description}</p>}
            </div>
            <form action={moveCategory.bind(null, restaurant.id, c.id, -1)}>
              <button type="submit" disabled={ci === 0} aria-label={`Move ${c.name} up`} className={small}>
                ↑
              </button>
            </form>
            <form action={moveCategory.bind(null, restaurant.id, c.id, 1)}>
              <button
                type="submit"
                disabled={ci === categories.length - 1}
                aria-label={`Move ${c.name} down`}
                className={small}
              >
                ↓
              </button>
            </form>
            <details className="w-full sm:w-auto">
              <summary className={`${small} inline-block cursor-pointer list-none`}>Rename</summary>
              <div className="mt-2 sm:w-[28rem]">
                <CategoryForm
                  action={renameCategory.bind(null, restaurant.id, c.id)}
                  defaults={{ name: c.name, description: c.description ?? '' }}
                  submitLabel="Save"
                />
              </div>
            </details>
            {c.items.length === 0 && (
              <form action={removeCategory.bind(null, restaurant.id, c.id)}>
                <button type="submit" className={`${small} text-red-700`}>
                  Delete
                </button>
              </form>
            )}
          </header>
          <ul className="divide-y divide-line">
            {c.items.map((item, ii) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                <Cover name={item.name} url={item.imageUrl} className="size-12 shrink-0 rounded-lg text-xl" />
                <div className="min-w-0 flex-1">
                  <Link href={`${base}/items/${item.id}`} className="font-semibold hover:text-brand-700">
                    {item.name}
                  </Link>
                  <p className="text-sm text-muted">
                    {item.optionGroups.length > 0 ? `from ${rupees(fromPrice(item))}` : rupees(item.pricePaisa)}
                    {item.optionGroups.length > 0 && ` · ${item.optionGroups.map((g) => g.name).join(', ')}`}
                  </p>
                </div>
                {!item.isAvailable && <StatusBadge label="Sold out" tone="bad" />}
                <form action={setItemAvailable.bind(null, restaurant.id, item.id, !item.isAvailable)}>
                  <button type="submit" className={small}>
                    {item.isAvailable ? 'Sold out' : 'Back in stock'}
                  </button>
                </form>
                <form action={moveItem.bind(null, restaurant.id, c.id, item.id, -1)}>
                  <button type="submit" disabled={ii === 0} aria-label={`Move ${item.name} up`} className={small}>
                    ↑
                  </button>
                </form>
                <form action={moveItem.bind(null, restaurant.id, c.id, item.id, 1)}>
                  <button
                    type="submit"
                    disabled={ii === c.items.length - 1}
                    aria-label={`Move ${item.name} down`}
                    className={small}
                  >
                    ↓
                  </button>
                </form>
                <Link href={`${base}/items/${item.id}`} className={small}>
                  Edit
                </Link>
              </li>
            ))}
          </ul>
          <div className="p-4">
            <Link href={`${base}/new?category=${c.id}`} className="text-sm font-bold text-brand-700">
              + Add an item to {c.name}
            </Link>
          </div>
        </section>
      ))}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">{categories.length ? 'Add a category' : 'Start your menu with a category'}</h2>
        <CategoryForm action={addCategoryAction.bind(null, restaurant.id)} submitLabel="Add category" />
      </section>
    </div>
  );
}
