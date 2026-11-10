'use client';

import { useState, useTransition } from 'react';
import { chooseArea, chooseCoordinates } from '@/app/actions';
import { CrosshairIcon, PinIcon } from '@/components/icons';
import { AREAS } from '@/lib/location';

/** The landing page's "where should we deliver?" box: pick an area, or let the browser locate you. */
export function LocationPicker({ current }: { current?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [locating, startLocating] = useTransition();

  const locate = () => {
    setError(null);
    if (!('geolocation' in navigator))
      return setError('Your browser cannot share your location. Pick an area instead.');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        startLocating(async () => {
          const result = await chooseCoordinates(coords.latitude, coords.longitude);
          setError(result.error);
        }),
      () => setError('We could not get your location. Pick an area instead.'),
      { timeout: 10_000 },
    );
  };

  return (
    <form action={chooseArea} className="rounded-xl bg-white p-3 shadow-xl shadow-brand-900/20">
      <div className="flex flex-col gap-2 md:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-line px-3 focus-within:border-brand-600">
          <PinIcon className="size-5 shrink-0 text-brand-600" />
          <span className="sr-only">Delivery area</span>
          <select
            name="area"
            required
            defaultValue={AREAS.flatMap((c) => c.areas).some((a) => a.label === current) ? current : ''}
            className="h-12 w-full cursor-pointer appearance-none bg-transparent text-ink outline-none"
          >
            <option value="" disabled>
              Choose your area
            </option>
            {AREAS.map((c) => (
              <optgroup key={c.city} label={c.city}>
                {c.areas.map((a) => (
                  <option key={a.label} value={a.label}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="flex h-12 items-center justify-center gap-2 rounded-lg px-4 font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-60"
        >
          <CrosshairIcon />
          {locating ? 'Locating…' : 'Locate me'}
        </button>
        <button
          type="submit"
          className="h-12 rounded-lg bg-brand-600 px-6 font-bold text-white hover:bg-brand-700 active:bg-brand-800"
        >
          Find food
        </button>
      </div>
      {error && (
        <p role="alert" className="px-1 pt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
