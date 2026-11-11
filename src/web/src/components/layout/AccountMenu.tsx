import Link from 'next/link';
import { logout } from '@/app/(shop)/login/actions';
import { ChevronDownIcon } from '@/components/icons';
import { formatPhone } from '@/lib/phone';
import { type Claims, isAdmin } from '@/lib/session-tokens';

/** The signed-in user's menu: a <details> dropdown, so it needs no JavaScript. */
export function AccountMenu({ user }: { user: Claims }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-canvas">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          {user.phone.slice(-2)}
        </span>
        <span className="hidden sm:inline">{formatPhone(user.phone)}</span>
        <ChevronDownIcon className="size-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-line bg-white p-2 shadow-lg">
        <Link href="/rider" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-brand-50">
          Ride with us
        </Link>
        <Link href="/vendor" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-brand-50">
          Your restaurant
        </Link>
        {isAdmin(user) && (
          <Link href="/admin" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-brand-50">
            Admin console
          </Link>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-brand-50"
          >
            Log out
          </button>
        </form>
      </div>
    </details>
  );
}
