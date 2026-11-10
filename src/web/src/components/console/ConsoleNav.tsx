'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BagIcon,
  BikeIcon,
  CalendarIcon,
  CashIcon,
  ChartIcon,
  ClockIcon,
  GridIcon,
  MapIcon,
  MenuIcon,
  StoreIcon,
  TicketIcon,
} from '@/components/icons';

// Icons by name: a server layout can't hand a client component a component, only data.
const ICONS = {
  bag: BagIcon,
  bike: BikeIcon,
  calendar: CalendarIcon,
  cash: CashIcon,
  chart: ChartIcon,
  clock: ClockIcon,
  grid: GridIcon,
  map: MapIcon,
  menu: MenuIcon,
  store: StoreIcon,
  ticket: TicketIcon,
};

export interface ConsoleLink {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Current only on its own address, not on the pages under it (a section's first page). */
  exact?: boolean;
  /** Other addresses that count as this section, e.g. an order's page under Deliveries. */
  also?: string[];
}

/** A console's sections; a column beside the page on wide screens, a scrolling row on phones. */
export function ConsoleNav({
  links,
  label,
  layout,
}: {
  links: ConsoleLink[];
  label: string;
  layout: 'column' | 'row';
}) {
  const path = usePathname();
  const current = (l: ConsoleLink) =>
    (l.exact ? path === l.href : path.startsWith(l.href)) || (l.also ?? []).some((p) => path.startsWith(p));
  return (
    <nav
      aria-label={label}
      className={
        layout === 'column' ? 'space-y-1' : 'no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-2'
      }
    >
      {links.map((l) => {
        const Icon = ICONS[l.icon];
        const on = current(l);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? 'page' : undefined}
            className={
              layout === 'column'
                ? `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    on ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink'
                  }`
                : `shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${
                    on ? 'border-brand-600 text-brand-600' : 'border-transparent text-muted'
                  }`
            }
          >
            {layout === 'column' && <Icon className="size-5" />}
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
