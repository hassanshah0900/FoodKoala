import { loadConfig, type AppConfig } from './config/config';

/** Valid config for tests; override what a test cares about. */
export function testConfig(overrides: Partial<Record<keyof AppConfig, string>> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://foodkoala:foodkoala@localhost:5432/foodkoala',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    OTP_PEPPER: 'test-pepper-0123456789',
    ...overrides,
  });
}
