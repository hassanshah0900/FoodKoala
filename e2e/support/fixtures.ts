import { type Browser, type BrowserContext, test as base, type Page } from '@playwright/test';
import { WEB_URL } from './env.ts';
import type { Person } from './people.ts';
import type { Point } from './places.ts';

/**
 * A browser of someone's own, as if on their phone: signed in when given a
 * person (the web app's two session cookies), and at `at` when the page asks
 * where it is. Map tiles are not fetched, so the tests don't load
 * OpenStreetMap's servers and don't wait on them.
 */
export async function phoneOf(browser: Browser, opts: { person?: Person; at?: Point } = {}): Promise<Page> {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    ...(opts.at
      ? { geolocation: { latitude: opts.at.lat, longitude: opts.at.lng }, permissions: ['geolocation'] }
      : {}),
  });
  await context.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  if (opts.person) await signInCookies(context, opts.person);
  return context.newPage();
}

async function signInCookies(context: BrowserContext, p: Person) {
  const cookie = { url: WEB_URL, httpOnly: true, sameSite: 'Lax' as const };
  await context.addCookies([
    { ...cookie, name: 'fk_access', value: p.accessToken, expires: Math.floor(Date.now() / 1000) + p.expiresIn },
    { ...cookie, name: 'fk_refresh', value: p.refreshToken, expires: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 },
  ]);
}

/** Every test gets its own browsers through phoneOf; this closes them all afterwards. */
export const test = base.extend<{ phone: (opts?: { person?: Person; at?: Point }) => Promise<Page> }>({
  phone: async ({ browser }, use) => {
    const pages: Page[] = [];
    await use(async (opts) => {
      const page = await phoneOf(browser, opts);
      pages.push(page);
      return page;
    });
    await Promise.all(pages.map((p) => p.context().close()));
  },
});

export { expect } from '@playwright/test';
