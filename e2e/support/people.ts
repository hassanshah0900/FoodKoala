import { call } from './api.ts';
import { loginCode, textsTo } from './sms.ts';

/** Signs in as an admin: e2e/compose.yml lists it in auth-service's ADMIN_PHONES. */
export const ADMIN_PHONE = '+923009999999';

/** Someone signed in: auth-service's session, as the web app keeps it. */
export interface Person {
  phone: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** A mobile number nobody has used, so each test starts with new customers, owners and riders. */
export function newPhone(): string {
  const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join('');
  return `+9231${Math.floor(Math.random() * 10)}${digits}`;
}

/** Signs in the way the app does (a code texted to the number), without the browser. */
export async function signIn(phone = newPhone()): Promise<Person> {
  const before = (await textsTo(phone)).length;
  await call('POST', 'auth/otp/request', { body: { phone } });
  const code = await loginCode(phone, before);
  const s = await call<{ accessToken: string; refreshToken: string; expiresIn: number; user: { id: string } }>(
    'POST',
    'auth/otp/verify',
    { body: { phone, code } },
  );
  return { phone, userId: s.user.id, accessToken: s.accessToken, refreshToken: s.refreshToken, expiresIn: s.expiresIn };
}

export const signInAdmin = () => signIn(ADMIN_PHONE);
