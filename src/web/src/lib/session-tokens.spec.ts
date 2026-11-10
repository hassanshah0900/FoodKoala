import { claimsOf, isAdmin, isFresh, sessionCookies } from './session-tokens';

const jwt = (payload: object) =>
  ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'signature'].join('.');

describe('session tokens', () => {
  const claims = { sub: 'u1', phone: '+923001234567', roles: ['customer'], exp: 2_000_000_000 };

  it('reads the claims', () =>
    expect(claimsOf(jwt(claims))).toEqual({
      userId: 'u1',
      phone: '+923001234567',
      roles: ['customer'],
      exp: 2_000_000_000,
    }));

  it.each([undefined, '', 'abc', 'a.!!!.c', jwt({ phone: 'x' })])('ignores a bad token: %s', (token) =>
    expect(claimsOf(token)).toBeNull(),
  );

  it('treats a token about to expire as stale', () => {
    const c = claimsOf(jwt(claims));
    expect(isFresh(c, 2_000_000_000_000 - 60_000)).toBe(true);
    expect(isFresh(c, 2_000_000_000_000 - 10_000)).toBe(false);
    expect(isFresh(null)).toBe(false);
  });

  it('sets both cookies httpOnly, and clears them', () => {
    const set = sessionCookies({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }, true);
    expect(set.map((c) => [c.name, c.value, c.options.maxAge, c.options.httpOnly, c.options.secure])).toEqual([
      ['fk_access', 'a', 900, true, true],
      ['fk_refresh', 'r', 2_592_000, true, true],
    ]);
    expect(sessionCookies(null, false).every((c) => c.value === '' && c.options.maxAge === 0)).toBe(true);
  });

  it('knows an admin by the role', () => {
    expect(isAdmin(claimsOf(jwt({ ...claims, roles: ['customer', 'admin'] })))).toBe(true);
    expect(isAdmin(claimsOf(jwt(claims)))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
