import Link from 'next/link';
import { KoalaMark } from '@/components/Logo';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <KoalaMark className="size-16 text-brand-200" />
      <h1 className="mt-4 text-2xl font-extrabold">We couldn't find that page</h1>
      <p className="mt-2 text-muted">The restaurant may have closed, or the link is wrong.</p>
      <Link
        href="/restaurants"
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700"
      >
        See restaurants
      </Link>
    </div>
  );
}
