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
  /** An order the restaurant hasn't accepted or rejected this many minutes after it was placed is rejected for it. */
  ACCEPT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
  /** How often to look for such orders. */
  ACCEPT_CHECK_MS: z.coerce.number().int().positive().default(15_000),
  /** `host:port,host:port`. Unset, the outbox is not published (fine for local runs without Kafka). */
  KAFKA_BROKERS: z
    .string()
    .optional()
    .transform((s) => {
      const brokers = s?.split(',').map((b) => b.trim()).filter(Boolean);
      return brokers?.length ? brokers : undefined;
    })
    .pipe(z.array(z.string().regex(/^[\w.-]+:\d+$/, 'expected host:port')).optional()),
  KAFKA_CLIENT_ID: z.string().min(1).default('order-service'),
  /** Consumer group for delivery events. */
  KAFKA_GROUP_ID: z.string().min(1).default('order-service'),
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
