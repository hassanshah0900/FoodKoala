import type { MenuItem } from '@/lib/api/types';
import { rupees } from '@/lib/format';
import { fromPrice } from '@/lib/menu';

export function MenuItemCard({ item }: { item: MenuItem }) {
  const hasChoices = item.optionGroups.length > 0;
  return (
    <article
      className={`flex gap-4 rounded-lg border border-line p-4 transition-shadow hover:shadow-md ${
        item.isAvailable ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="font-bold">{item.name}</h3>
        <p className="text-sm font-semibold">
          {hasChoices && <span className="font-normal text-muted">from </span>}
          {rupees(fromPrice(item))}
        </p>
        {item.description && <p className="line-clamp-2 text-sm text-muted">{item.description}</p>}
        {!item.isAvailable && <p className="text-xs font-bold tracking-wide text-red-700 uppercase">Sold out</p>}
      </div>
      {item.imageUrl && (
        // biome-ignore lint/performance/noImgElement: menu photos come from any host restaurants upload to.
        <img src={item.imageUrl} alt="" loading="lazy" className="size-24 shrink-0 rounded-lg object-cover" />
      )}
    </article>
  );
}
