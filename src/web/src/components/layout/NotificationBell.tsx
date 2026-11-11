'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BellIcon } from '@/components/icons';
import { BELL_POLL_MS, badge } from '@/lib/notifications';

/**
 * The bell in the header, with how many notifications are unread. It asks again every half minute
 * and when the tab comes back into view, so a chat message waiting for you shows up without a reload.
 */
export function NotificationBell({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  useEffect(() => setCount(initial), [initial]);
  useEffect(() => {
    const check = () =>
      fetch('/notifications/count')
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { count: number } | null) => b && setCount(b.count))
        .catch(() => undefined);
    const timer = setInterval(check, BELL_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return (
    <Link
      href="/notifications"
      className="relative grid size-10 place-items-center rounded-full text-ink hover:bg-canvas"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <BellIcon className="size-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
          {badge(count)}
        </span>
      )}
    </Link>
  );
}
