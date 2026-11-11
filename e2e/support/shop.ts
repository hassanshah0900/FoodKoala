// Steps a customer takes in the app, shared by the journeys that need them.

import { expect, type Page } from '@playwright/test';
import { reloadUntilVisible } from './reload.ts';
import type { Restaurant } from './world.ts';

/** "Locate me" on the landing page: the browser's location becomes where to deliver. */
export async function deliverHere(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Locate me' }).click();
  await page.waitForURL('**/restaurants');
}

/**
 * Finds the restaurant in the listing and opens it. A new restaurant reaches
 * search-service through Kafka, so the listing may need a few reloads first.
 */
export async function openFromListing(page: Page, restaurant: Pick<Restaurant, 'name'>) {
  const link = page.getByRole('link', { name: new RegExp(restaurant.name) }).first();
  await reloadUntilVisible(page, link);
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: restaurant.name })).toBeVisible();
}

/** Opens an item, picks `choice` when it asks for one, and adds it to the cart. */
export async function addToCart(page: Page, item: string, choice?: string) {
  await page.getByRole('button', { name: `Add ${item}`, exact: true }).click();
  const sheet = page.getByRole('dialog');
  if (choice) await sheet.getByLabel(choice).check();
  await sheet.getByRole('button', { name: /^Add to cart/ }).click();
  await expect(sheet).toBeHidden();
}

/** From the restaurant page to checkout, saving a first address at the browser's location. */
export async function checkoutWithNewAddress(page: Page) {
  await page.getByRole('link', { name: 'Review payment and address' }).first().click();
  await page.waitForURL('**/checkout**');
  await page.getByPlaceholder('House, flat and street').fill('House 12, Street 5');
  await page.getByPlaceholder('Area', { exact: true }).fill('Model Town');
  await page.getByPlaceholder('City', { exact: true }).fill('Testpur');
  await page.getByPlaceholder('Note for the rider (optional)').fill('Ring the bell twice');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByRole('link', { name: /House 12, Street 5/ })).toBeVisible();
}

/** Presses the order button (place or schedule) and lands on the new order's page; returns its id. */
export async function placeOrder(page: Page, button: RegExp = /^Place order/): Promise<string> {
  await page.getByRole('button', { name: button }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** The whole customer side up to the order button: locate, find the restaurant, add an item, add an address. */
export async function fillCartAndCheckout(page: Page, restaurant: Restaurant) {
  await deliverHere(page);
  await openFromListing(page, restaurant);
  await addToCart(page, restaurant.raita);
  await checkoutWithNewAddress(page);
}
