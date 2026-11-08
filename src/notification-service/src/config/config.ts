import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3007),
    DATABASE_URL: z.url(),
    /** `host:port,host:port`. Unset, no events are consumed (fine for local runs without Kafka). */
    KAFKA_BROKERS: z
      .string()
      .optional()
      .transform((s) => {
        const brokers = s?.split(',').map((b) => b.trim()).filter(Boolean);
        return brokers?.length ? brokers : undefined;
      })
      .pipe(z.array(z.string().regex(/^[\w.-]+:\d+$/, 'expected host:port')).optional()),
    KAFKA_GROUP_ID: z.string().min(1).default('notification-service'),

    /** `log` prints messages instead of sending them; refused in production. */
    SMS_PROVIDER: z.enum(['log', 'twilio']).default('log'),
    TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-f]{32}$/).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    /** A Messaging Service (MG...) or a sender number in E.164. */
    TWILIO_FROM: z.string().regex(/^(MG[0-9a-f]{32}|\+\d{8,15})$/).optional(),
    TWILIO_API_URL: z.url().default('https://api.twilio.com'),
    SMS_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    /** How often the sender looks for queued messages. */
    SMS_POLL_MS: z.coerce.number().int().positive().default(1000),
    /** Attempts before a message is given up as failed. */
    SMS_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  })
  .superRefine((c, ctx) => {
    if (c.SMS_PROVIDER === 'log' && c.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'log is for development; use twilio in production' });
    }
    if (c.SMS_PROVIDER === 'twilio') {
      for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'] as const) {
        if (!c[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when SMS_PROVIDER=twilio' });
      }
    }
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
