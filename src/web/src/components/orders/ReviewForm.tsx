'use client';

import { useActionState } from 'react';
import type { ReviewState } from '@/app/(shop)/orders/actions';
import { StarIcon } from '@/components/icons';
import { RATING_WORDS } from '@/lib/reviews';

type Action = (prev: ReviewState, form: FormData) => Promise<ReviewState>;

/** Five stars as radio buttons, so it works by keyboard and without JavaScript. */
function StarPicker({ name, label }: { name: string; label: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      {/*
        Written 5 to 1 and shown reversed, so the stars up to the one chosen (or hovered) are that
        star and the ones after it in the markup, which CSS can reach with ~.
      */}
      <div className="mt-1 flex flex-row-reverse justify-end gap-1 [&_label:has(input:checked)_svg]:text-amber-500 [&_label:has(input:checked)~label_svg]:text-amber-500 [&_label:hover_svg]:text-amber-400 [&_label:hover~label_svg]:text-amber-400">
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n} className="cursor-pointer" title={RATING_WORDS[n]}>
            <input type="radio" name={name} value={n} required className="sr-only" />
            <span className="sr-only">
              {n} star{n > 1 ? 's' : ''}, {RATING_WORDS[n]}
            </span>
            <StarIcon className="size-8 text-line transition-colors" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ action, withRider }: { action: Action; withRider: boolean }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-4">
      <StarPicker name="restaurantRating" label="The food" />
      {withRider && <StarPicker name="riderRating" label="Your rider" />}
      <label className="block text-sm font-semibold">
        Anything to add? <span className="font-normal text-muted">optional, shown without your name</span>
        <textarea
          name="comment"
          maxLength={500}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-line p-2 font-normal"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Send rating
      </button>
    </form>
  );
}
