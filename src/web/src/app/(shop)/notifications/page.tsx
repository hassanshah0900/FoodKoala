import type { Metadata } from 'next';
import { myNotifications } from '@/lib/api/notifications';
import { ago } from '@/lib/format';
import { notificationHref } from '@/lib/notifications';
import { accessToken, requireUser } from '@/lib/session';
import { openNotification, readAll } from './actions';

export const metadata: Metadata = { title: 'Notifications' };

/** What happened with my orders and deliveries, newest first; unread ones stand out. */
export default async function Notifications() {
  await requireUser('/notifications');
  const inbox = await myNotifications((await accessToken())!, 1, 50);
  const now = Date.now();
  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-extrabold">Notifications</h1>
          {inbox.unreadCount > 0 && (
            <form action={readAll}>
              <button type="submit" className="text-sm font-semibold text-brand-600 hover:underline">
                Mark all as read
              </button>
            </form>
          )}
        </div>
        {inbox.items.length === 0 ? (
          <p className="rounded-xl bg-white px-6 py-16 text-center text-muted shadow-sm">
            Nothing yet. News about your orders shows up here.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-sm">
            {inbox.items.map((n) => (
              <li key={n.id}>
                <form action={openNotification.bind(null, n.id, notificationHref(n))}>
                  <button
                    type="submit"
                    className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-brand-50 ${n.read ? '' : 'bg-brand-50/50'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`text-sm ${n.read ? 'font-semibold' : 'font-bold'}`}>{n.title}</span>
                        <span className="shrink-0 text-xs text-muted">{ago(n.createdAt, now)}</span>
                      </span>
                      <span className="block text-sm text-muted">{n.body}</span>
                      {!n.read && <span className="sr-only">Unread</span>}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
