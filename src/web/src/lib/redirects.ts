/**
 * Where to go after signing in. Only paths on this site: "//evil.com" and
 * "https://…" would send the customer elsewhere with their fresh session.
 */
export function safeNext(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}
