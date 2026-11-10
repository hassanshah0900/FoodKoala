import Link from 'next/link';
import type { Page } from '@/lib/api/types';
import { countLabel } from '@/lib/paging';

/** One queue on the overview: how many are waiting, the oldest few, and a link to the rest. */
export function WaitingCard<T>({
  title,
  page,
  row,
  more,
}: {
  title: string;
  page: Page<T>;
  row: (item: T) => { key: string; href: string; label: string; meta: string };
  more: { href: string; label: string };
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-bold">{title}</h2>
        <span className="text-3xl font-extrabold text-brand-600">{countLabel(page)}</span>
      </div>
      {page.items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing waiting.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line text-sm">
          {page.items.slice(0, 5).map((item) => {
            const r = row(item);
            return (
              <li key={r.key}>
                <Link href={r.href} className="flex justify-between gap-4 py-2 hover:text-brand-700">
                  <span className="truncate font-semibold">{r.label}</span>
                  <span className="shrink-0 text-muted">{r.meta}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={more.href} className="mt-4 inline-block text-sm font-bold text-brand-700">
        {more.label} →
      </Link>
    </section>
  );
}
