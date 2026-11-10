import { type NextRequest, NextResponse } from 'next/server';
import { refreshSession } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/http';
import { ACCESS_COOKIE, claimsOf, isFresh, REFRESH_COOKIE, sessionCookies } from '@/lib/session-tokens';

/**
 * Renews the session before a page renders: access tokens last 15 minutes,
 * and Server Components can read cookies but not set them. The new cookies go
 * both on the request (so this render uses them) and on the response.
 */
export async function proxy(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh || isFresh(claimsOf(request.cookies.get(ACCESS_COOKIE)?.value))) return NextResponse.next();

  let cookies: ReturnType<typeof sessionCookies>;
  try {
    cookies = sessionCookies(await refreshSession(refresh), request.nextUrl.protocol === 'https:');
  } catch (err) {
    // Expired or revoked: sign out. Anything else (auth-service down) keeps the cookies to try again.
    if (!(err instanceof ApiError) || err.status !== 401) return NextResponse.next();
    cookies = sessionCookies(null, false);
  }
  for (const c of cookies) request.cookies.set(c.name, c.value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const c of cookies) response.cookies.set(c.name, c.value, c.options);
  return response;
}

export const config = {
  // Pages and server actions only: not build assets or the browser's icon requests.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon).*)'],
};
