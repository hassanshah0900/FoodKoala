'use client';

import { useState, useTransition } from 'react';
import { step } from '@/app/rider/actions';

/** The delivery's next step, big enough to press on a bike; handing it back only before pickup. */
export function StepButtons({
  deliveryId,
  next,
  label,
  canDecline,
}: {
  deliveryId: string;
  next: 'pickup' | 'dropoff';
  label: string;
  canDecline: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (which: 'pickup' | 'dropoff' | 'decline') =>
    start(async () => {
      const r = await step(deliveryId, which);
      setError(r.error ?? null);
    });
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => run(next)}
        disabled={pending}
        className="w-full rounded-2xl bg-brand-600 py-4 text-lg font-extrabold text-white disabled:opacity-50"
      >
        {pending ? 'One moment…' : label}
      </button>
      {canDecline && (
        <button
          type="button"
          onClick={() => run('decline')}
          disabled={pending}
          className="w-full py-2 text-sm font-semibold text-red-700"
        >
          I can't take this one
        </button>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
