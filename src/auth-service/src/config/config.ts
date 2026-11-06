import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

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

    /** `log` writes codes to the service log; only allowed outside production. */
    SMS_PROVIDER: z.enum(['log']).default('log'),
  })
  .superRefine((c, ctx) => {
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
