import { defineConfig, devices } from '@playwright/test';
import { WEB_URL } from './support/env.ts';

/**
 * Runs against the stack `make e2e-up` starts; nothing is started from here.
 * Tests run one at a time: they share one stack, and an online rider is
 * offered any order near them, so parallel journeys could steal each other's.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Orders move through Kafka between services; give each journey room.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
