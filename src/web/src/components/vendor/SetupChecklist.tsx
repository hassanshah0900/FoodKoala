import Link from 'next/link';
import type { setupSteps } from '@/lib/restaurant-form';

/** What a new restaurant still has to do before customers can order, each linking to where it's done. */
export function SetupChecklist({ base, steps }: { base: string; steps: ReturnType<typeof setupSteps> }) {
  const left = steps.filter((s) => !s.done).length;
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">
        {left === 0 ? 'All set' : `${left} step${left === 1 ? '' : 's'} before customers can order`}
      </h2>
      <ol className="mt-3 space-y-2 text-sm">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? 'bg-green-100 text-green-800' : 'bg-canvas text-muted'
              }`}
            >
              {s.done ? '✓' : ''}
            </span>
            <span className="sr-only">{s.done ? 'Done:' : 'To do:'}</span>
            {s.path && !s.done ? (
              <Link href={`${base}/${s.path}`} className="font-semibold text-brand-700 hover:underline">
                {s.label}
              </Link>
            ) : (
              <span className={s.done ? 'text-muted line-through' : ''}>{s.label}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
