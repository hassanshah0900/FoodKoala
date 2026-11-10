'use client';

import { startTransition, useActionState, useState } from 'react';
import type { SettingsState } from '@/app/vendor/settings-actions';
import type { TimeRange, Weekday } from '@/lib/api/types';
import { DAYS } from '@/lib/hours';
import {
  type DayDraft,
  type DayMode,
  DEFAULT_RANGE,
  type HoursDraft,
  MAX_RANGES,
  type SpecialDraft,
} from '@/lib/hours-editing';

type Action = (prev: SettingsState, form: FormData) => Promise<SettingsState>;

const time = 'rounded-lg border border-line px-2 py-1.5 text-sm';
const small = 'text-sm font-semibold text-brand-700 disabled:opacity-30';

/** Opening times for one day: each a pair of times, closing earlier than opening meaning after midnight. */
function Ranges({ ranges, onChange }: { ranges: TimeRange[]; onChange: (r: TimeRange[]) => void }) {
  const set = (i: number, r: Partial<TimeRange>) => onChange(ranges.map((x, j) => (j === i ? { ...x, ...r } : x)));
  return (
    <div className="space-y-2">
      {ranges.map((r, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ranges have no id; their place is their identity while editing.
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            aria-label="Opens"
            value={r.opens}
            onChange={(e) => set(i, { opens: e.target.value })}
            className={time}
          />
          <span className="text-muted">to</span>
          <input
            type="time"
            aria-label="Closes"
            value={r.closes}
            onChange={(e) => set(i, { closes: e.target.value })}
            className={time}
          />
          {r.closes !== '' && r.closes < r.opens && <span className="text-xs text-muted">next day</span>}
          {ranges.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(ranges.filter((_, j) => j !== i))}
              className="text-sm text-muted hover:text-red-700"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        disabled={ranges.length >= MAX_RANGES}
        onClick={() => onChange([...ranges, { opens: '18:00', closes: '23:00' }])}
        className={small}
      >
        + Add a break (another opening time)
      </button>
    </div>
  );
}

const MODES: [DayMode, string][] = [
  ['ranges', 'Open'],
  ['allDay', '24 hours'],
  ['closed', 'Closed'],
];

/** The week, and special days like Ramadan or Eid that replace it on their dates. */
export function HoursEditor({ action, initial }: { action: Action; initial: HoursDraft }) {
  const [state, submit, pending] = useActionState(action, {});
  const [draft, setDraft] = useState(initial);
  const setDay = (d: Weekday, change: Partial<DayDraft>) =>
    setDraft({ ...draft, weekly: { ...draft.weekly, [d]: { ...draft.weekly[d], ...change } } });
  const setSpecial = (i: number, change: Partial<SpecialDraft>) =>
    setDraft({ ...draft, special: draft.special.map((s, j) => (j === i ? { ...s, ...change } : s)) });
  const copyMonday = () =>
    setDraft({
      ...draft,
      weekly: Object.fromEntries(DAYS.map(([d]) => [d, structuredClone(draft.weekly.mon)])) as HoursDraft['weekly'],
    });

  return (
    <form
      // Submitted by hand: a form `action` is reset when it ends, which would undo the editor's state.
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => submit(form));
      }}
      className="space-y-8"
    >
      <input type="hidden" name="hours" value={JSON.stringify(draft)} />
      <section className="rounded-xl bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <h2 className="text-lg font-bold">Every week</h2>
          <button type="button" onClick={copyMonday} className={small}>
            Use Monday's hours every day
          </button>
        </header>
        <ul className="divide-y divide-line">
          {DAYS.map(([key, day]) => {
            const d = draft.weekly[key];
            return (
              <li key={key} className="grid gap-3 p-4 sm:grid-cols-[8rem_auto_1fr] sm:items-start">
                <span className="pt-1.5 font-semibold">{day}</span>
                <div className="flex gap-1">
                  {MODES.map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={d.mode === mode}
                      onClick={() => setDay(key, { mode })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        d.mode === mode ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line hover:bg-canvas'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {d.mode === 'ranges' && <Ranges ranges={d.ranges} onChange={(ranges) => setDay(key, { ranges })} />}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl bg-white shadow-sm">
        <header className="border-b border-line p-4">
          <h2 className="text-lg font-bold">Special days</h2>
          <p className="text-sm text-muted">
            Ramadan, Eid or a holiday: these hours replace the week's on those dates.
          </p>
        </header>
        <ul className="divide-y divide-line">
          {draft.special.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            <li key={i} className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-semibold">
                  Name
                  <input
                    value={s.name}
                    onChange={(e) => setSpecial(i, { name: e.target.value })}
                    placeholder="Ramadan"
                    className={`${time} block`}
                  />
                </label>
                <label className="text-sm font-semibold">
                  From
                  <input
                    type="date"
                    value={s.startsOn}
                    onChange={(e) => setSpecial(i, { startsOn: e.target.value })}
                    className={`${time} block`}
                  />
                </label>
                <label className="text-sm font-semibold">
                  To
                  <input
                    type="date"
                    value={s.endsOn}
                    onChange={(e) => setSpecial(i, { endsOn: e.target.value })}
                    className={`${time} block`}
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={s.closed}
                    onChange={(e) => setSpecial(i, { closed: e.target.checked })}
                    className="accent-brand-600"
                  />
                  Closed
                </label>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, special: draft.special.filter((_, j) => j !== i) })}
                  className="pb-2 text-sm text-muted hover:text-red-700"
                >
                  Remove
                </button>
              </div>
              {!s.closed && <Ranges ranges={s.ranges} onChange={(ranges) => setSpecial(i, { ranges })} />}
            </li>
          ))}
        </ul>
        <div className="p-4">
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                special: [
                  ...draft.special,
                  { name: '', startsOn: '', endsOn: '', closed: false, ranges: [DEFAULT_RANGE] },
                ],
              })
            }
            className={small}
          >
            + Add a special day
          </button>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-line bg-white/95 px-4 py-3 lg:-mx-8 lg:px-8">
        {state.errors?.map((e) => (
          <p key={e} role="alert" className="text-sm text-red-700">
            {e}
          </p>
        ))}
        {state.saved && !state.errors && (
          <p role="status" className="text-sm text-green-700">
            Saved. Customers see the new hours now.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save opening hours
        </button>
      </div>
    </form>
  );
}
