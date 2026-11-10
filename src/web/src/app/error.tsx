'use client';

import { KoalaMark } from '@/components/Logo';

/** Shown when a service didn't answer; trying again re-renders the page. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <KoalaMark className="size-16 text-brand-200" />
      <h1 className="mt-4 text-2xl font-extrabold">Something went wrong</h1>
      <p className="mt-2 text-muted">We couldn't load this page just now. Please try again in a moment.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700"
      >
        Try again
      </button>
    </div>
  );
}
