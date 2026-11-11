import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: { default: 'Rider', template: '%s · FoodKoala rider' } };

/** The rider app: made for a phone in one hand, so one column and big buttons. */
export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/rider');
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-bold text-brand-700">Rider</span>
          </div>
          <AccountMenu user={user} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5">{children}</main>
    </div>
  );
}
