import type { Tone } from '@/lib/review';

const TONES: Record<Tone, string> = {
  waiting: 'bg-amber-100 text-amber-800',
  good: 'bg-green-100 text-green-800',
  bad: 'bg-red-100 text-red-800',
  neutral: 'bg-canvas text-muted',
};

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${TONES[tone]}`}>{label}</span>;
}
