import Link from 'next/link';

/** The koala mark: a round head with two ears. */
export function KoalaMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="9" cy="13" r="7.5" fill="currentColor" />
      <circle cx="31" cy="13" r="7.5" fill="currentColor" />
      <circle cx="9" cy="13" r="3.5" fill="white" opacity=".55" />
      <circle cx="31" cy="13" r="3.5" fill="white" opacity=".55" />
      <circle cx="20" cy="22" r="13" fill="currentColor" />
      <circle cx="15" cy="20" r="1.8" fill="white" />
      <circle cx="25" cy="20" r="1.8" fill="white" />
      <ellipse cx="20" cy="26.5" rx="3.6" ry="4.4" fill="white" />
    </svg>
  );
}

export function Logo({ tone = 'brand' }: { tone?: 'brand' | 'white' }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2 text-xl font-extrabold tracking-tight ${tone === 'white' ? 'text-white' : 'text-brand-600'}`}
    >
      <KoalaMark />
      foodkoala
    </Link>
  );
}
