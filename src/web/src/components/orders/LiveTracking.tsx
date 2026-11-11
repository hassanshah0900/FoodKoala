'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Tracking } from '@/lib/api/types';
import { newer } from '@/lib/tracking';
import { TrackingCard } from './TrackingCard';

/** How often "Last seen 4 min ago" is worked out again while no position arrives. */
const CLOCK_MS = 30_000;

/**
 * Keeps the tracking card live: listens to the order's event stream (orders/[id]/live) and keeps the
 * newest tracking. When the order finishes the page is refreshed, so it shows the delivered order.
 */
export function LiveTracking({ initial }: { initial: Tracking }) {
  const router = useRouter();
  const [latest, setLatest] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const tracking = useMemo(() => newer(latest, initial), [latest, initial]);

  useEffect(() => {
    const source = new EventSource(`/orders/${initial.orderId}/live`);
    source.addEventListener('tracking', (e) => {
      const next = JSON.parse((e as MessageEvent<string>).data) as Tracking;
      setLatest((prev) => newer(prev, next));
      setNow(Date.now());
    });
    source.addEventListener('end', () => {
      source.close();
      router.refresh();
    });
    return () => source.close();
  }, [initial.orderId, router]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  return <TrackingCard tracking={tracking} now={now} />;
}
