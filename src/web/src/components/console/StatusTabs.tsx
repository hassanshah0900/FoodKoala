import Link from 'next/link';
import type { StatusLabel } from '@/lib/review';

/** A list's statuses as tabs; each is a link, so the choice lives in the URL. */
export function StatusTabs<S extends string>({
  path,
  tabs,
  current,
}: {
  path: string;
  tabs: readonly StatusLabel<S>[];
  current: S;
}) {
  return (
    <div className="no-scrollbar flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.status}
          href={`${path}?status=${t.status}`}
          aria-current={t.status === current ? 'page' : undefined}
          className={`shrink-0 border-b-2 py-3 text-sm font-semibold whitespace-nowrap ${
            t.status === current ? 'border-brand-600 text-brand-600' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
