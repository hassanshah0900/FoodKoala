import { StarIcon } from '@/components/icons';

/** A rating shown as filled stars, with the number for screen readers. */
export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'text-amber-500' : 'text-line'}>
          <StarIcon className="size-4" />
        </span>
      ))}
    </span>
  );
}
