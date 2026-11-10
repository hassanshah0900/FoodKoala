/**
 * A Pakistani mobile number as auth-service wants it (+923XXXXXXXXX), from
 * how people type it: 0300 1234567, 300-1234567, 923001234567 or +92 300 1234567.
 * Null when it isn't one.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  const match = /^(?:\+92|92|0)?(3\d{9})$/.exec(digits);
  return match ? `+92${match[1]}` : null;
}

/** +923001234567 → +92 300 1234567. */
export const formatPhone = (e164: string) => e164.replace(/^\+92(\d{3})(\d{7})$/, '+92 $1 $2');
