import { StarIcon } from '@/components/icons';
import type { Rating } from '@/lib/api/types';
import { ratingCount } from '@/lib/format';

/** ★ 4.5 (500+), or "New" before the first review. */
export function RatingLabel({ rating }: { rating: Rating }) {
  if (rating.average === null) return <span className="font-semibold text-brand-600">New</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <StarIcon className="size-4 text-amber-500" />
      <span className="font-semibold">{rating.average.toFixed(1)}</span>
      <span className="text-muted">({ratingCount(rating.count)})</span>
    </span>
  );
}
