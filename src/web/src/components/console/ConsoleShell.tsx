import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { AccountMenu } from '@/components/layout/AccountMenu';
import type { Claims } from '@/lib/session-tokens';
import { type ConsoleLink, ConsoleNav } from './ConsoleNav';

/**
 * The frame of the admin and restaurant consoles: their sections down the side
 * (a row on phones) instead of the customer's header, and the account menu.
 */
export function ConsoleShell({
  badge,
  links,
  user,
  side,
  children,
}: {
  /** Whose console it is: "Admin" or "Partner". */
  badge: string;
  links: ConsoleLink[];
  user: Claims;
  /** Shown under the sections, e.g. a switch between the owner's restaurants. */
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  const brand = (
    <div className="flex items-center gap-2">
      <Logo />
      <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-bold text-brand-700">{badge}</span>
    </div>
  );
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white p-4 lg:flex">
        <div className="mb-6 px-2">{brand}</div>
        <ConsoleNav links={links} label={badge} layout="column" />
        {side && <div className="mt-6 border-t border-line pt-4">{side}</div>}
        <Link href="/" className="mt-auto px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
          ← Back to ordering
        </Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 bg-white lg:border-b lg:border-line">
          <div className="flex h-16 items-center gap-2 px-4 lg:px-8">
            <div className="lg:hidden">{brand}</div>
            <div className="ml-auto flex items-center gap-2">
              {side && <div className="lg:hidden">{side}</div>}
              <AccountMenu user={user} />
            </div>
          </div>
          <div className="lg:hidden">
            <ConsoleNav links={links} label={badge} layout="row" />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
