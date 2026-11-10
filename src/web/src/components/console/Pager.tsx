import Link from 'next/link';
import type { Page } from '@/lib/api/types';
import { pageHref } from '@/lib/paging';

/** Newer and older pages of a list, keeping its filters. */
export function Pager({
  page,
  path,
  params,
}: {
  page: Page<unknown>;
  path: string;
  params: Record<string, string | undefined>;
}) {
  if (page.page === 1 && !page.hasMore) return null;
  const link = 'rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-brand-50';
  return (
    <nav aria-label="Pages" className="flex items-center justify-between">
      {page.page > 1 ? (
        <Link href={pageHref(path, params, page.page - 1)} className={link}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">Page {page.page}</span>
      {page.hasMore ? (
        <Link href={pageHref(path, params, page.page + 1)} className={link}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
