import { cuisineEmoji } from '@/lib/cuisines';

/** Purple shades a restaurant without a photo gets, picked by its name so it keeps the same one. */
const SHADES = [
  'from-brand-500 to-brand-700',
  'from-brand-400 to-brand-600',
  'from-brand-600 to-brand-800',
  'from-fuchsia-500 to-brand-700',
  'from-violet-500 to-brand-700',
];

const shadeOf = (name: string) =>
  SHADES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SHADES.length];

/** The restaurant's photo, or on a purple gradient its cuisine's picture (else its initial). */
export function Cover({
  name,
  url,
  cuisine,
  className = '',
}: {
  name: string;
  url: string | null;
  cuisine?: string;
  className?: string;
}) {
  if (url) {
    // biome-ignore lint/performance/noImgElement: covers come from any host restaurants upload to; next/image needs each listed.
    return <img src={url} alt="" className={`object-cover ${className}`} loading="lazy" />;
  }
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${shadeOf(name)} text-5xl font-extrabold text-white/90 ${className}`}
    >
      {(cuisine && cuisineEmoji(cuisine)) ?? name.charAt(0).toUpperCase()}
    </div>
  );
}
