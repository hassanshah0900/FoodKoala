import Link from 'next/link';
import { ChevronDownIcon, PinIcon } from '@/components/icons';
import { Logo } from '@/components/Logo';
import type { DeliveryLocation } from '@/lib/location';

/** White bar on every page: the logo, and where the customer is ordering to. */
export function Header({ location }: { location: DeliveryLocation | null }) {
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
      </div>
    </header>
  );
}
