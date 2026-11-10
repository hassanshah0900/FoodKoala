'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-renders the page every `seconds` while something is still happening, so its status keeps up. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
