import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Runs against a real Redis; menu-service is replaced by a stand-in in the test.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
