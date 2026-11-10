import type { MenuCategory } from '@/lib/api/types';
import { MenuItemCard } from './MenuItemCard';

export function MenuSections({ categories }: { categories: MenuCategory[] }) {
  return (
    <div className="space-y-10 pt-6">
      {categories.map((c) => (
        <section key={c.id} id={`category-${c.id}`} className="scroll-mt-32">
          <h2 className="text-2xl font-extrabold">{c.name}</h2>
          {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {c.items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
