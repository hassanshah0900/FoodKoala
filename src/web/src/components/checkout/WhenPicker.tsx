import Link from 'next/link';
import { type CheckoutChoices, checkoutHref, checkoutQuery } from '@/lib/checkout';
import { slotsByDay } from '@/lib/schedule';

/**
 * As soon as possible, or a time the restaurant is open (its open slots). The time is picked from a
 * plain GET form, so the page re-prices and re-checks on the server like the other choices.
 */
export function WhenPicker({
  choices,
  slots,
  asap,
  now,
}: {
  choices: CheckoutChoices;
  /** The restaurant's open slots; null when they couldn't be loaded. */
  slots: string[] | null;
  /** How long as soon as possible takes, e.g. "35–45 min"; null when it can't be delivered now. */
  asap: string | null;
  now: number;
}) {
  const scheduled = choices.at !== undefined;
  const others = [...checkoutQuery({ ...choices, at: undefined })];
  return (
    <div className="space-y-3">
      <Link
        href={checkoutHref(choices, { at: undefined })}
        aria-current={scheduled ? undefined : 'true'}
        className={`flex items-center justify-between rounded-lg border p-4 text-sm ${
          scheduled ? 'border-line hover:border-brand-300' : 'border-brand-600 bg-brand-50'
        }`}
      >
        <span className="font-bold">As soon as possible</span>
        {asap && <span className="text-muted">{asap}</span>}
      </Link>
      {slots && slots.length > 0 ? (
        <form
          action="/checkout"
          className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${
            scheduled ? 'border-brand-600 bg-brand-50' : 'border-line'
          }`}
        >
          {others.map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className="min-w-0 flex-1">
            <span className="sr-only">Schedule for</span>
            <select
              name="at"
              required
              defaultValue={scheduled && slots.includes(choices.at!) ? choices.at : ''}
              className="h-10 w-full cursor-pointer rounded-lg border border-line bg-white px-2 text-sm"
            >
              <option value="" disabled>
                Schedule for later…
              </option>
              {slotsByDay(slots, now).map((d) => (
                <optgroup key={d.day} label={d.day}>
                  {d.slots.map((s) => (
                    <option key={s.iso} value={s.iso}>
                      {d.day}, {s.time}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-10 rounded-lg border border-brand-600 px-4 text-sm font-bold text-brand-600 hover:bg-brand-600 hover:text-white"
          >
            Schedule
          </button>
        </form>
      ) : (
        slots && <p className="text-sm text-muted">No times to schedule for in the coming week.</p>
      )}
    </div>
  );
}
