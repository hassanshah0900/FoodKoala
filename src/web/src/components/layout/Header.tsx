import Link from 'next/link';
import { ChevronDownIcon, PinIcon } from '@/components/icons';
import { Logo } from '@/components/Logo';
import type { DeliveryLocation } from '@/lib/location';
import type { Claims } from '@/lib/session-tokens';
import { AccountMenu } from './AccountMenu';

/** White bar on every page: the logo, where the customer is ordering to, and who is signed in. */
export function Header({ location, user }: { location: DeliveryLocation | null; user: Claims | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Logo />
        {location && (
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-canvas"
            title="Change delivery location"
          >
            <PinIcon className="size-5 shrink-0 text-brand-600" />
            <span className="truncate font-semibold">{location.label}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted" />
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <AccountMenu user={user} />
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-bold text-brand-600 hover:bg-brand-50"
              >
                Log in
              </Link>
              <Link
                href="/login"
                className="hidden rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 sm:block"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
