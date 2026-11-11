import { expect } from '@playwright/test';
import { SMS_URL } from './env.ts';

/** A text FoodKoala sent, as fake-sms recorded it. */
export interface Sms {
  to: string;
  body: string;
  at: string;
}

/** Every text sent to a number so far, oldest first. */
export async function textsTo(phone: string): Promise<Sms[]> {
  const res = await fetch(new URL(`/messages?to=${encodeURIComponent(phone)}`, SMS_URL));
  if (!res.ok) throw new Error(`fake-sms answered ${res.status}; is the e2e stack up (make e2e-up)?`);
  return (await res.json()) as Sms[];
}

/** Waits for a text to the number that matches, sent after `since` (a count from textsTo). */
export async function waitForText(phone: string, match: RegExp, since = 0, timeout = 15_000): Promise<Sms> {
  let found: Sms | undefined;
  await expect
    .poll(
      async () => {
        found = (await textsTo(phone)).slice(since).find((m) => match.test(m.body));
        return found !== undefined;
      },
      { timeout, message: `a text to ${phone} matching ${match}` },
    )
    .toBe(true);
  return found!;
}

/** The newest login code texted to the number after `since`. */
export async function loginCode(phone: string, since: number): Promise<string> {
  const sms = await waitForText(phone, /is your FoodKoala login code/, since);
  return sms.body.slice(0, 6);
}
