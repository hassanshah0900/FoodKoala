import { z } from 'zod';

/**
 * Normalises a Pakistani mobile number to E.164 (+923XXXXXXXXX).
 * Accepts 03001234567, 3001234567, 923001234567, 00923001234567 and +92 300-1234567.
 * Returns null for anything that is not a Pakistani mobile number.
 */
export function normalizePakistaniMobile(input: string): string | null {
  const digits = input.trim().replace(/[\s()-]/g, '');
  const match = /^(?:\+92|0092|92|0)?(3\d{9})$/.exec(digits);
  return match ? `+92${match[1]}` : null;
}

export const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizePakistaniMobile(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'must be a Pakistani mobile number, e.g. 03001234567' });
    return z.NEVER;
  }
  return phone;
});
