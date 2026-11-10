import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, type Claims, claimsOf, isFresh } from './session-tokens';

/**
 * The signed-in user, from the access token proxy.ts keeps fresh; null for guests.
 */
export async function currentUser(): Promise<Claims | null> {
  const claims = claimsOf((await cookies()).get(ACCESS_COOKIE)?.value);
  return isFresh(claims, Date.now(), 0) ? claims : null;
}

/** The access token, to call the API as the user. */
export async function accessToken(): Promise<string | null> {
  return (await currentUser()) ? ((await cookies()).get(ACCESS_COOKIE)?.value ?? null) : null;
}

/** The user, or a redirect to sign in and come back to `here`. */
export async function requireUser(here: string): Promise<Claims> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);
  return user;
}
