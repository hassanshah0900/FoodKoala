import { safeNext } from './redirects';

describe('safeNext', () => {
  it.each(['/restaurants', '/restaurant/abc?x=1'])('keeps %s', (path) => expect(safeNext(path)).toBe(path));
  it.each([undefined, '', 'restaurants', '//evil.com', '/\\evil.com', 'https://evil.com'])('refuses %s', (raw) =>
    expect(safeNext(raw)).toBe('/'),
  );
});
