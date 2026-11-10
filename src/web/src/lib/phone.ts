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

/** +923001234567 → +92 300 1234567; a landline keeps its digits together after +92, as area codes vary in length. */
export const formatPhone = (e164: string) =>
  e164.replace(/^\+92(3\d{2})(\d{7})$/, '+92 $1 $2').replace(/^\+92([1-9]\d+)$/, '+92 $1');

/**
 * A restaurant's phone in E.164, mobile or landline: "021 3456 7890" → +922134567890.
 * restaurant-service takes +92 and 9 or 10 digits.
 */
export function normalizeAnyPhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  const match = /^(?:\+92|0092|92|0)([1-9]\d{8,9})$/.exec(digits);
  return match ? `+92${match[1]}` : null;
}
