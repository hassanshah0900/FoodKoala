// Records a video tour of the whole site on the seeded demo: a customer
// orders, the kitchen cooks, the rider delivers, the customer rates it, then
// the restaurant's console and the admin console.
//
//   make e2e-up && cd e2e && npm run seed && npm run tour
//
// One browser tab plays every part, switching sign-ins between scenes, so the
// story is one continuous recording. Captions say who is acting. The video is
// saved as tour/out/foodkoala-tour.webm (and .mp4 when ffmpeg is installed).

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import { GULBERG, ownerPhone, PHONES } from '../seed/catalogue.ts';
import { call } from '../support/api.ts';
import { WEB_URL } from '../support/env.ts';
import { type Person, signIn } from '../support/people.ts';
import { near } from '../support/places.ts';
import { textsTo } from '../support/sms.ts';

const OUT = join(import.meta.dirname, 'out');
const SIZE = { width: 1280, height: 720 };
const RIDER_SPOT = near(GULBERG, 250, -300);

// --- Showing it -------------------------------------------------------------

/** A caption bar and a visible cursor (videos don't show the real one), added to every page. */
const OVERLAY = () => {
  const style = document.createElement('style');
  style.textContent = `
    #tour-caption { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 2147483647;
      background: rgba(30, 14, 56, .92); color: #fff; padding: 10px 22px; border-radius: 14px; pointer-events: none;
      font: 500 17px/1.4 system-ui, sans-serif; max-width: 78%; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.3) }
    #tour-caption b { display: block; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #d8b4fe }
    #tour-caption:empty { display: none }
    #tour-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
      background: rgba(124, 58, 237, .35); border: 2px solid #7c3aed; pointer-events: none; transition: transform .12s; left: -50px; top: -50px }
    #tour-cursor.down { transform: scale(.6); background: rgba(124, 58, 237, .7) }`;
  const add = () => {
    document.documentElement.append(style);
    const cursor = Object.assign(document.createElement('div'), { id: 'tour-cursor' });
    const caption = Object.assign(document.createElement('div'), { id: 'tour-caption' });
    caption.innerHTML = sessionStorage.getItem('tour-caption') ?? '';
    document.documentElement.append(cursor, caption);
    addEventListener(
      'mousemove',
      (e) => Object.assign(cursor.style, { left: `${e.clientX}px`, top: `${e.clientY}px` }),
      true,
    );
    addEventListener('mousedown', () => cursor.classList.add('down'), true);
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);
  };
  if (document.documentElement) add();
  else addEventListener('DOMContentLoaded', add);
};

const pause = (page: Page, ms = 1200) => page.waitForTimeout(ms);

/** Sets the caption, kept across page loads until the next one. */
async function say(page: Page, who: string, text: string) {
  const html = text ? `<b>${who}</b>${text}` : '';
  await page.evaluate((h) => {
    sessionStorage.setItem('tour-caption', h);
    const el = document.getElementById('tour-caption');
    if (el) el.innerHTML = h;
  }, html);
  await pause(page, 900);
}

/** A full-screen title between parts of the story. */
async function card(page: Page, title: string, sub: string, ms = 3000) {
  await say(page, '', '');
  await page.evaluate(
    ([t, s]) => {
      const el = document.createElement('div');
      el.id = 'tour-card';
      el.innerHTML = `<div style="font:800 46px/1.2 system-ui,sans-serif">${t}</div><div style="font:400 22px/1.5 system-ui,sans-serif;margin-top:14px;opacity:.85;max-width:780px">${s}</div>`;
      Object.assign(el.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483646',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: '#fff',
        background: 'linear-gradient(135deg, #6d28d9, #3b0764)',
      });
      document.documentElement.append(el);
    },
    [title, sub],
  );
  await pause(page, ms);
  await page.evaluate(() => document.getElementById('tour-card')?.remove());
}

/** Scrolls by `px` in small steps, so it reads as scrolling and not a jump. */
async function scroll(page: Page, px: number, step = 90) {
  const n = Math.ceil(Math.abs(px) / step);
  await page.mouse.move(SIZE.width / 2, SIZE.height / 2);
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(0, Math.sign(px) * step);
    await page.waitForTimeout(45);
  }
  await pause(page, 600);
}

async function toTop(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await pause(page, 600);
}

/** Moves the cursor onto the element first, then clicks: viewers see where. */
async function click(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await target.hover();
  await target.page().waitForTimeout(350);
  await target.click();
}

async function type(target: Locator, text: string) {
  await click(target);
  await target.pressSequentially(text, { delay: 55 });
}

/** Reloads until the locator shows, for what reaches a page through Kafka a moment later. */
async function reloadUntil(page: Page, target: Locator, timeout = 45_000) {
  await expect(async () => {
    if (!(await target.isVisible())) {
      await page.reload();
      await expect(target).toBeVisible({ timeout: 3000 });
    }
  }).toPass({ timeout, intervals: [2000] });
}

// --- Who is acting ----------------------------------------------------------

/** Swaps the tab's sign-in to `p` (the web app's two session cookies). */
async function as(page: Page, p: Person) {
  const ctx = page.context();
  await ctx.clearCookies({ name: 'fk_access' });
  await ctx.clearCookies({ name: 'fk_refresh' });
  const cookie = { url: WEB_URL, httpOnly: true, sameSite: 'Lax' as const };
  await ctx.addCookies([
    { ...cookie, name: 'fk_access', value: p.accessToken },
    { ...cookie, name: 'fk_refresh', value: p.refreshToken },
  ]);
}

// --- The story --------------------------------------------------------------

async function customerOrders(page: Page) {
  await page.goto('/');
  await card(
    page,
    'FoodKoala',
    'Food delivery for Pakistan: customers, restaurants, riders and admins, built as microservices.',
    3500,
  );
  await say(page, 'Customer', 'Ayesha is hungry. First she picks where to deliver.');
  await pause(page, 800);
  await click(page.getByRole('combobox', { name: 'Delivery area' }));
  await page.getByRole('combobox', { name: 'Delivery area' }).selectOption({ label: 'Gulberg, Lahore' });
  await pause(page, 700);
  await click(page.getByRole('button', { name: 'Find food' }));
  await page.waitForURL('**/restaurants**');

  await say(page, 'Customer', 'Restaurants that deliver to Gulberg, with times, fees and ratings.');
  await scroll(page, 500);
  await toTop(page);
  await say(page, 'Customer', 'Filter by cuisine…');
  await click(page.getByRole('navigation', { name: 'Cuisines' }).getByRole('link', { name: /Burgers/ }));
  await page.waitForURL('**cuisine=burgers**');
  await pause(page, 1500);
  await say(page, 'Customer', '…or search for a dish.');
  await click(page.getByRole('link', { name: 'All cuisines' }));
  await page.waitForURL((u) => !u.search.includes('cuisine'));
  await type(page.getByRole('searchbox', { name: 'Search restaurants and dishes' }), 'biryani');
  await page.keyboard.press('Enter');
  await page.waitForURL('**q=biryani**');
  await pause(page, 2000);
  await click(page.getByRole('link', { name: /Lahori Biryani House/ }).first());
  await expect(page.getByRole('heading', { level: 1, name: 'Lahori Biryani House' })).toBeVisible();

  await say(page, 'Customer', 'The menu: categories, choices, and items the kitchen has marked sold out.');
  await scroll(page, 700);
  await toTop(page);

  await say(page, 'Customer', 'Signing in is a mobile number and a code by SMS.');
  await click(page.getByRole('link', { name: 'Log in' }).first());
  const before = (await textsTo(PHONES.customer)).length;
  await type(page.getByRole('textbox', { name: 'Mobile number' }), '0300 1000001');
  await click(page.getByRole('button', { name: 'Continue' }));
  const code = await expect
    .poll(async () => (await textsTo(PHONES.customer)).slice(before).at(-1)?.body.slice(0, 6), { timeout: 15_000 })
    .toMatch(/^\d{6}$/)
    .then(async () => (await textsTo(PHONES.customer)).at(-1)!.body.slice(0, 6));
  await type(page.getByPlaceholder('••••••'), code);
  await click(page.getByRole('button', { name: 'Log in' }));
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));

  const shop = await call<{ id: string; name: string }[]>('GET', 'restaurants/mine', {
    token: (await signIn(ownerPhone(1))).accessToken,
  });
  await page.goto(`/restaurant/${shop[0].id}`);
  await say(page, 'Customer', 'Signed in: now the heart saves a favourite, and the cart fills.');
  await click(page.getByRole('button', { name: 'Add Chicken Biryani', exact: true }));
  const sheet = page.getByRole('dialog');
  await pause(page, 900);
  await click(sheet.getByText('Full', { exact: true }));
  await click(sheet.getByText('Coke 345 ml', { exact: true }));
  await pause(page, 700);
  await click(sheet.getByRole('button', { name: /^Add to cart/ }));
  await expect(sheet).toBeHidden();
  await click(page.getByRole('button', { name: 'Add Raita', exact: true }));
  await click(page.getByRole('dialog').getByRole('button', { name: /^Add to cart/ }));
  await expect(page.getByRole('dialog')).toBeHidden();
  await pause(page, 1200);

  await click(page.getByRole('link', { name: 'Review payment and address' }).first());
  await page.waitForURL('**/checkout**');
  await say(page, 'Customer', 'Checkout: her saved address, a tip for the rider, and a voucher.');
  await pause(page, 1200);
  await scroll(page, 300);
  await click(page.getByRole('link', { name: 'Rs 100', exact: true }).first());
  await pause(page, 1000);
  await type(page.getByRole('textbox', { name: 'Voucher code' }), 'KOALA20');
  await click(page.getByRole('button', { name: 'Apply', exact: true }));
  await pause(page, 1800);
  await scroll(page, 400);
  await say(page, 'Customer', 'Cash on delivery, as most of Pakistan pays.');
  await click(page.getByRole('button', { name: /^Place order/ }));
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await say(page, 'Customer', 'The order is in. She waits for the restaurant to accept it.');
  await pause(page, 2500);
  return { orderUrl: new URL(page.url()).pathname, restaurantId: shop[0].id };
}

async function kitchen(page: Page, restaurantId: string, owner: Person, rider: Person) {
  await as(page, owner);
  await page.goto(`/vendor/${restaurantId}`);
  await card(page, 'The restaurant', 'Lahori Biryani House runs its kitchen from the partner console.', 2500);
  await say(page, 'Restaurant', 'The new order arrives on the live kitchen screen.');
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 20_000 });
  await pause(page, 1500);
  await click(page.getByRole('button', { name: 'Accept' }));
  await say(page, 'Restaurant', 'Accepted with a prep time. The customer sees when to expect it.');
  // The rider's phone keeps sending where they are; this stands in until the rider scene opens it.
  await call('PUT', 'delivery/riders/me/location', { token: rider.accessToken, body: RIDER_SPOT });
  await expect(page.getByRole('button', { name: 'Food is ready' })).toBeVisible();
  await pause(page, 1500);
  await click(page.getByRole('button', { name: 'Food is ready' }));
  await say(page, 'Restaurant', 'Packed. Now it waits for the rider.');
  await pause(page, 2000);
}

async function riderPicksUp(page: Page, rider: Person) {
  await as(page, rider);
  await page.context().setGeolocation({ latitude: RIDER_SPOT.lat, longitude: RIDER_SPOT.lng });
  await page.goto('/rider');
  await card(page, 'The rider', 'Bilal is on shift. Orders go to the nearest free rider.', 2500);
  await say(page, 'Rider', 'The order is offered to Bilal: where to collect it, and how much cash to take.');
  await expect(page.getByRole('button', { name: 'I have the food' })).toBeVisible({ timeout: 45_000 });
  await pause(page, 1500);
  await scroll(page, 300);
  await say(page, 'Rider', 'He can chat with the customer: text and photos.');
  await type(page.getByLabel('Message'), 'Salam! Collecting your biryani now.');
  await click(page.getByRole('button', { name: 'Send', exact: true }));
  await pause(page, 1000);
  await click(page.getByRole('button', { name: 'I have the food' }));
  await expect(page.getByRole('button', { name: 'Delivered' })).toBeVisible();
  await say(page, 'Rider', 'Picked up and on the way.');
  await pause(page, 1500);
}

async function customerTracks(page: Page, customer: Person, orderUrl: string) {
  await as(page, customer);
  await page.goto(orderUrl);
  await say(page, 'Customer', 'Ayesha follows the rider live on the map…');
  await reloadUntil(page, page.getByRole('heading', { name: 'Your rider is on the way' }));
  await pause(page, 2500);
  await scroll(page, 450);
  await say(page, 'Customer', '…and answers his message with a tap.');
  await click(page.getByRole('button', { name: 'Leave it at the gate' }));
  await pause(page, 2000);
}

async function riderDelivers(page: Page, rider: Person) {
  await as(page, rider);
  await page.goto('/rider');
  await say(page, 'Rider', 'Her reply arrived. Bilal hands over the food and collects the cash.');
  await expect(page.getByRole('button', { name: 'Delivered' })).toBeVisible();
  await scroll(page, 300);
  await pause(page, 1200);
  await click(page.getByRole('button', { name: 'Delivered' }));
  await pause(page, 1500);
  await page.goto('/rider/earnings');
  await say(page, 'Rider', 'His earnings: delivery fees and tips, and the cash he owes FoodKoala.');
  await pause(page, 2500);
  await click(page.getByRole('link', { name: '7 days' }));
  await pause(page, 1500);
  await scroll(page, 400);
}

async function customerRates(page: Page, customer: Person, orderUrl: string) {
  await as(page, customer);
  await page.goto(orderUrl);
  await reloadUntil(page, page.getByRole('heading', { name: 'Delivered. Enjoy your meal!' }));
  await say(page, 'Customer', 'Delivered. Ayesha rates the food and the rider.');
  const rating = page.getByRole('group', { name: 'The food' });
  await rating.scrollIntoViewIfNeeded();
  await click(rating.locator('label', { hasText: '5 stars' }));
  await click(page.getByRole('group', { name: 'Your rider' }).locator('label', { hasText: '5 stars' }));
  await type(page.getByLabel(/Anything to add/), 'Hot, fresh and on time!');
  await click(page.getByRole('button', { name: 'Send rating' }));
  await expect(page.getByRole('heading', { name: 'Your rating' })).toBeVisible();
  await pause(page, 1500);

  await page.goto('/orders');
  await say(page, 'Customer', 'Her past orders, each one "Order again" away.');
  await scroll(page, 500);
  await toTop(page);
  await page.goto('/notifications');
  await say(page, 'Customer', 'Every step also came as a notification (and an SMS).');
  await pause(page, 2500);
  await page.goto('/account');
  await say(page, 'Customer', 'Her details, saved addresses and favourite restaurants.');
  await scroll(page, 500);
  await pause(page, 1000);
}

async function partnerConsole(page: Page, restaurantId: string, owner: Person) {
  await as(page, owner);
  const base = `/vendor/${restaurantId}`;
  await page.goto(`${base}/reports`);
  await card(page, 'The partner console', 'Everything a restaurant needs to run on FoodKoala.', 2500);
  await say(page, 'Restaurant', 'Sales: orders, average order, prep time and best sellers.');
  await scroll(page, 600);
  await toTop(page);
  await page.goto(`${base}/history`);
  await say(page, 'Restaurant', 'Past orders.');
  await pause(page, 2000);
  await page.goto(`${base}/menu`);
  await say(page, 'Restaurant', 'The menu editor: categories, items, order, and a one-tap "Sold out".');
  await scroll(page, 500);
  await toTop(page);
  await click(page.getByRole('link', { name: 'Chicken Biryani', exact: true }));
  await say(page, 'Restaurant', 'Items have required and optional choices with their own prices.');
  await scroll(page, 600);
  await page.goto(`${base}/hours`);
  await say(page, 'Restaurant', 'Opening hours for the week, plus special days like Ramadan or Eid.');
  await pause(page, 1500);
  await click(page.getByRole('button', { name: '+ Add a special day' }));
  await pause(page, 1500);
  await page.goto(`${base}/zones`);
  await say(page, 'Restaurant', 'Delivery zones, each with its own fee, minimum order and time.');
  await scroll(page, 400);
  await pause(page, 1500);
  await page.goto(base);
  await say(page, 'Restaurant', 'Too busy? Pause new orders for a while.');
  await pause(page, 2000);
  await page.goto('/vendor/new');
  await say(page, 'New restaurant', 'Any restaurant can apply to be listed; FoodKoala reviews it.');
  await scroll(page, 900);
  await pause(page, 800);
}

async function adminConsole(page: Page, admin: Person, orderUrl: string) {
  await as(page, admin);
  await page.goto('/admin');
  await card(
    page,
    'The admin console',
    'Where FoodKoala approves partners, watches deliveries and settles cash.',
    2500,
  );
  await say(page, 'Admin', 'What needs attention: deliveries without a rider, and applications.');
  await pause(page, 2500);

  // Approving happens once per seed; a second run of the tour shows the lists without it.
  await page.goto('/admin/restaurants');
  const chai = page.getByRole('link', { name: /Chai Khana/ });
  if (await chai.count()) {
    await say(page, 'Admin', 'Chai Khana has applied. The admin checks it and approves it.');
    await click(chai);
    await scroll(page, 500);
    await toTop(page);
    await click(page.getByRole('button', { name: 'Approve' }));
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await pause(page, 1500);
  }

  await page.goto('/admin/riders');
  const usman = page.getByRole('link', { name: /Usman Tariq/ });
  if (await usman.count()) {
    await say(page, 'Admin', 'Usman has applied to ride. Approved too.');
    await click(usman);
    await pause(page, 1200);
    await click(page.getByRole('button', { name: 'Approve' }));
    await expect(page.getByText('Approved', { exact: true })).toBeVisible();
    await pause(page, 1500);
  }

  await page.goto('/admin/riders?status=approved');
  await say(page, 'Admin', "Each rider's earnings and the cash they hold, and settlements recorded here.");
  await click(page.getByRole('link', { name: /Bilal Ahmed/ }));
  await scroll(page, 500);
  await pause(page, 1000);

  await page.goto('/admin/orders');
  await say(page, 'Admin', 'Any order can be found by its short code, to step in when something goes wrong.');
  const code = orderUrl.split('/').pop()!.slice(0, 8).toUpperCase();
  await type(page.getByRole('textbox', { name: 'Order code or id' }), code);
  await click(page.getByRole('button', { name: 'Find' }));
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/);
  await scroll(page, 600);
  await pause(page, 1000);

  await page.goto('/admin/deliveries?status=delivered');
  await say(page, 'Admin', 'Deliveries by status.');
  await pause(page, 2000);
  await page.goto('/admin/payments?status=collected');
  await say(page, 'Admin', 'Payments: cash collected at the door.');
  await pause(page, 2000);
  await page.goto('/admin/vouchers');
  await say(page, 'Admin', 'Vouchers, with limits, dates and usage.');
  await pause(page, 1500);
  await click(page.getByRole('link', { name: 'New voucher' }));
  await scroll(page, 500);
  await pause(page, 1000);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const [customer, owner, rider, admin] = await Promise.all(
    [PHONES.customer, ownerPhone(1), PHONES.rider, PHONES.admin].map((p) => signIn(p)),
  );

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: WEB_URL,
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    geolocation: { latitude: GULBERG.lat, longitude: GULBERG.lng },
    permissions: ['geolocation'],
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  try {
    console.log('Customer orders');
    const { orderUrl, restaurantId } = await customerOrders(page);
    console.log('Kitchen');
    await kitchen(page, restaurantId, owner, rider);
    console.log('Rider picks up');
    await riderPicksUp(page, rider);
    console.log('Customer tracks');
    await customerTracks(page, customer, orderUrl);
    console.log('Rider delivers');
    await riderDelivers(page, rider);
    console.log('Customer rates');
    await customerRates(page, customer, orderUrl);
    console.log('Partner console');
    await partnerConsole(page, restaurantId, owner);
    console.log('Admin console');
    await adminConsole(page, admin, orderUrl);
    await page.goto('/');
    await card(
      page,
      'FoodKoala',
      'Next.js · Go · NestJS · FastAPI · Kafka · PostgreSQL/PostGIS · Redis · MongoDB · Elasticsearch',
      4000,
    );
  } catch (e) {
    await page.screenshot({ path: join(OUT, 'failed.png') });
    throw e;
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const webm = join(OUT, 'foodkoala-tour.webm');
      renameSync(await video.path(), webm);
      try {
        const mp4 = join(OUT, 'foodkoala-tour.mp4');
        execFileSync('ffmpeg', [
          '-y',
          '-loglevel',
          'error',
          '-i',
          webm,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '20',
          '-movflags',
          '+faststart',
          mp4,
        ]);
        console.log(`Saved ${mp4}`);
      } catch {
        console.log(`Saved ${webm} (no ffmpeg for an .mp4)`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
