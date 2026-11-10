import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL: z.url(),
  MAX_ADDRESSES_PER_USER: z.coerce.number().int().positive().default(10),
  MAX_FAVOURITES_PER_USER: z.coerce.number().int().positive().default(100),
  /** Asked whether a restaurant is listed, and for what favourites show. */
  RESTAURANT_SERVICE_URL: z.url().default('http://localhost:3003'),
  RESTAURANT_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
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
