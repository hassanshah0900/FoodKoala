import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNav } from '@/components/admin/AdminNav';
import { Logo } from '@/components/Logo';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · FoodKoala admin' } };

const Brand = () => (
  <div className="flex items-center gap-2">
    <Logo />
    <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-bold text-brand-700">Admin</span>
  </div>
);

/** The admin console: its own frame, with the sections down the side instead of the customer's header. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin('/admin');
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white p-4 lg:flex">
        <div className="mb-6 px-2">
          <Brand />
        </div>
        <AdminNav layout="column" />
        <Link href="/" className="mt-auto px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
          ← Back to ordering
        </Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 bg-white lg:border-b lg:border-line">
          <div className="flex h-16 items-center gap-2 px-4 lg:px-8">
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="ml-auto">
              <AccountMenu user={user} />
            </div>
          </div>
          <div className="lg:hidden">
            <AdminNav layout="row" />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
