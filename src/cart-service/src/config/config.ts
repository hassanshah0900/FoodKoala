import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3005),
  REDIS_URL: z.url(),
  /** menu-service prices every cart line (POST /restaurants/{id}/price). */
  MENU_SERVICE_URL: z.url().default('http://localhost:3004'),
  MENU_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  /** order-service, asked for the caller's past order when they reorder it. */
  ORDER_SERVICE_URL: z.url().default('http://localhost:3006'),
  ORDER_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  CART_TTL_DAYS: z.coerce.number().int().positive().default(7),
  MAX_CART_LINES: z.coerce.number().int().positive().default(50),
});

export type AppConfig = z.infer<typeof configSchema>;

/** Parses environment variables, failing fast with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}
