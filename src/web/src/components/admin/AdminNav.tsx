'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BikeIcon, GridIcon, StoreIcon } from '@/components/icons';

const LINKS = [
  { href: '/admin', label: 'Overview', Icon: GridIcon },
  { href: '/admin/restaurants', label: 'Restaurants', Icon: StoreIcon },
  { href: '/admin/riders', label: 'Riders', Icon: BikeIcon },
];

/** The console's sections; a column beside the page on wide screens, a scrolling row on phones. */
export function AdminNav({ layout }: { layout: 'column' | 'row' }) {
  const path = usePathname();
  const current = (href: string) => (href === '/admin' ? path === href : path.startsWith(href));
  return (
    <nav
      aria-label="Admin"
      className={
        layout === 'column' ? 'space-y-1' : 'no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-2'
      }
    >
      {LINKS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={current(href) ? 'page' : undefined}
          className={
            layout === 'column'
              ? `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                  current(href) ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink'
                }`
              : `shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${
                  current(href) ? 'border-brand-600 text-brand-600' : 'border-transparent text-muted'
                }`
          }
        >
          {layout === 'column' && <Icon className="size-5" />}
          {label}
        </Link>
      ))}
    </nav>
  );
}
