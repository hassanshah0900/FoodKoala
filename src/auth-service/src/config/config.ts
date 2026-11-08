import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** An empty variable (e.g. `TWILIO_FROM=` from compose) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    /** PKCS#8 PEM of the RS256 signing key. Optional outside production (a temporary key is generated). */
    JWT_PRIVATE_KEY: z.string().optional(),
    JWT_ISSUER: z.string().default('foodkoala-auth'),
    JWT_AUDIENCE: z.string().default('foodkoala'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    /** Secret mixed into stored OTP hashes, so a Redis dump does not reveal codes. */
    OTP_PEPPER: z.string().min(16),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

    /** `log` writes codes to the service log (only outside production); `twilio` sends them. */
    SMS_PROVIDER: z.enum(['log', 'twilio']).default('log'),
    TWILIO_ACCOUNT_SID: optional(z.string().regex(/^AC[0-9a-f]{32}$/)),
    TWILIO_AUTH_TOKEN: optional(z.string().min(1)),
    /** A Messaging Service (MG...) or a sender number in E.164. */
    TWILIO_FROM: optional(z.string().regex(/^(MG[0-9a-f]{32}|\+\d{8,15})$/)),
    TWILIO_API_URL: z.url().default('https://api.twilio.com'),
    /** A login waits on this, so keep it short. */
    SMS_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  })
  .superRefine((c, ctx) => {
    if (c.SMS_PROVIDER === 'twilio') {
      for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'] as const) {
        if (!c[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when SMS_PROVIDER=twilio' });
      }
    }
    if (c.NODE_ENV !== 'production') return;
    if (!c.JWT_PRIVATE_KEY) {
      ctx.addIssue({ code: 'custom', path: ['JWT_PRIVATE_KEY'], message: 'required in production' });
    }
    if (c.SMS_PROVIDER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: '"log" would write login codes to the logs; configure a real SMS provider',
      });
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
