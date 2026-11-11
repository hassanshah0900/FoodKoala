import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Reloads until the locator shows. For what reaches a page through Kafka a
 * moment after the click that caused it, e.g. an order's status after the
 * rider's pickup, or a new restaurant in search.
 */
export async function reloadUntilVisible(page: Page, locator: Locator, timeout = 30_000) {
  await expect(async () => {
    await page.reload();
    await expect(locator).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout });
}
