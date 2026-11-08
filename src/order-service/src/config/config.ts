import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const url = (fallback: string) => z.url().default(fallback);

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3006),
  DATABASE_URL: z.url(),
  /** Asked for the caller's cart at checkout, and to empty it afterwards. */
  CART_SERVICE_URL: url('http://localhost:3005'),
  /** Asked for the caller's saved delivery address. */
  USER_SERVICE_URL: url('http://localhost:3002'),
  /** Asked whether a restaurant delivers to the address, and who owns it (ADR 0006). */
  RESTAURANT_SERVICE_URL: url('http://localhost:3003'),
  /** Per call to another service; checkout makes a few of them. */
  SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  /** Ride time added to the prep time when a restaurant accepts, until tracking-service gives real ETAs. */
  RIDE_MINUTES: z.coerce.number().int().min(0).default(15),
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
