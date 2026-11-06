import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Runs against real PostgreSQL and Redis (migrated with `npm run db:migrate`).
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      OTP_PEPPER: 'e2e-pepper-0123456789',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://foodkoala:foodkoala@localhost:5432/foodkoala',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
