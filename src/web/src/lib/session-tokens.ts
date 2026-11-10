// The session as two httpOnly cookies, shared by the sign-in actions and proxy.ts.

export const ACCESS_COOKIE = 'fk_access';
export const REFRESH_COOKIE = 'fk_refresh';

/** auth-service's Session, the fields kept. */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds the access token lasts. */
  expiresIn: number;
}

/** Who the access token says the caller is. */
export interface Claims {
  userId: string;
  phone: string;
  roles: string[];
  /** Expiry, seconds since the epoch. */
  exp: number;
}

/**
 * The token's claims, read without checking its signature: api-gateway
 * verifies every token it is sent, so this only decides what to show.
 */
export function claimsOf(token: string | undefined): Claims | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof c.sub !== 'string' || typeof c.exp !== 'number') return null;
    return { userId: c.sub, phone: String(c.phone ?? ''), roles: Array.isArray(c.roles) ? c.roles : [], exp: c.exp };
  } catch {
    return null;
  }
}

/** Still good for at least `marginSeconds`, so a page rendered now won't send a token that expires mid-way. */
export const isFresh = (claims: Claims | null, now = Date.now(), marginSeconds = 30): claims is Claims =>
  claims !== null && claims.exp * 1000 > now + marginSeconds * 1000;

/** How long a refresh token is kept; auth-service decides when it really expires. */
const REFRESH_MAX_AGE = 30 * 24 * 3600;

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: 'lax'; secure: boolean; path: '/'; maxAge: number };
}

/** Both cookies for a new or refreshed session; a maxAge of 0 deletes them (`tokens` null). */
export function sessionCookies(tokens: Tokens | null, secure: boolean): CookieToSet[] {
  const base = { httpOnly: true, sameSite: 'lax', secure, path: '/' } as const;
  return [
    {
      name: ACCESS_COOKIE,
      value: tokens?.accessToken ?? '',
      options: { ...base, maxAge: tokens ? tokens.expiresIn : 0 },
    },
    {
      name: REFRESH_COOKIE,
      value: tokens?.refreshToken ?? '',
      options: { ...base, maxAge: tokens ? REFRESH_MAX_AGE : 0 },
    },
  ];
}
