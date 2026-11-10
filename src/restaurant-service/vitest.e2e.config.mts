import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Runs against a real PostgreSQL (migrated with `npm run db:migrate`).
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.e2e-spec.ts'],
    // The files share restaurants.outbox: the relay test must not publish rows another file is checking.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://foodkoala:foodkoala@localhost:5432/foodkoala',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
