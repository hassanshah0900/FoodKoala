import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3004),
  DATABASE_URL: z.url(),
  /** restaurant-service, asked who owns a restaurant (ADR 0006). */
  RESTAURANT_SERVICE_URL: z.url().default('http://localhost:3003'),
  RESTAURANT_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MAX_CATEGORIES_PER_RESTAURANT: z.coerce.number().int().positive().default(50),
  MAX_ITEMS_PER_RESTAURANT: z.coerce.number().int().positive().default(300),
  /** `host:port,host:port`. Unset, the outbox is not published (fine for local runs without Kafka). */
  KAFKA_BROKERS: z
    .string()
    .optional()
    .transform((s) => {
      const brokers = s?.split(',').map((b) => b.trim()).filter(Boolean);
      return brokers?.length ? brokers : undefined;
    })
    .pipe(z.array(z.string().regex(/^[\w.-]+:\d+$/, 'expected host:port')).optional()),
  KAFKA_CLIENT_ID: z.string().min(1).default('menu-service'),
  /** How often the relay looks for new events when the outbox is empty. */
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(500),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  /** Published events are kept this long in Postgres for debugging, then deleted. */
  OUTBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
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
