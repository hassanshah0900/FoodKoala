'use client';

import { useState, useTransition } from 'react';
import { endShift, startShift } from '@/app/rider/actions';

/** Going online needs where the rider is, so the phone is asked for its location first. */
export function ShiftSwitch({ online, carrying }: { online: boolean; carrying: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const goOnline = () => {
    setError(null);
    if (!('geolocation' in navigator)) return setError('This phone cannot share its location.');
    navigator.geolocation.getCurrentPosition(
      (p) =>
        start(async () => {
          const r = await startShift({ lat: p.coords.latitude, lng: p.coords.longitude });
          if (r.error) setError(r.error);
        }),
      () => setError('Allow location for FoodKoala to go online: orders are offered to the nearest riders.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const goOffline = () =>
    start(async () => {
      const r = await endShift();
      if (r.error) setError(r.error);
    });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={online ? goOffline : goOnline}
        disabled={pending || (online && carrying)}
        className={`w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-50 ${
          online ? 'border-2 border-line bg-white text-ink' : 'bg-brand-600 text-white'
        }`}
      >
        {pending ? 'One moment…' : online ? 'Go offline' : 'Go online'}
      </button>
      {online && carrying && (
        <p className="text-center text-xs text-muted">Finish the delivery you have before going offline.</p>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
