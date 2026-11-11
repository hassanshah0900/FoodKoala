import Link from 'next/link';
import { setFavourite } from '@/app/(shop)/account/actions';
import { HeartIcon } from '@/components/icons';

const style =
  'flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white hover:bg-brand-50';

/** A heart to keep a restaurant among the customer's favourites; guests are asked to log in first. */
export function FavouriteButton({ restaurantId, favourite }: { restaurantId: string; favourite: boolean | null }) {
  if (favourite === null)
    return (
      <Link
        href={`/login?next=/restaurant/${restaurantId}`}
        className={style}
        aria-label="Log in to save as a favourite"
      >
        <HeartIcon className="size-5 text-brand-600" />
      </Link>
    );
  return (
    <form action={setFavourite.bind(null, restaurantId, !favourite)}>
      <button
        type="submit"
        aria-pressed={favourite}
        aria-label={favourite ? 'Remove from favourites' : 'Save as a favourite'}
        className={style}
      >
        <HeartIcon className="size-5 text-brand-600" filled={favourite} />
      </button>
    </form>
  );
}
