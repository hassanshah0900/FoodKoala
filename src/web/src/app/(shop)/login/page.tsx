import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { KoalaMark } from '@/components/Logo';
import { safeNext } from '@/lib/redirects';
import { currentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Log in or sign up' };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, '/restaurants');
  if (await currentUser()) redirect(next);
  return (
    <div className="flex justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <KoalaMark className="size-12 text-brand-600" />
        <h1 className="mt-4 text-2xl font-extrabold">Welcome!</h1>
        <p className="mt-1 mb-6 text-muted">Log in or sign up with your mobile number. We'll text you a code.</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
