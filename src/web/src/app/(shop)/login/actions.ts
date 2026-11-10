'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requestCode, revoke, verifyCode } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/http';
import { normalizePhone } from '@/lib/phone';
import { safeNext } from '@/lib/redirects';
import { REFRESH_COOKIE, sessionCookies, type Tokens } from '@/lib/session-tokens';

/** Where the two-step form is: asking for the number, or for the code texted to it. */
export type LoginState =
  | { step: 'phone'; error?: string; phone?: string }
  | { step: 'code'; phone: string; resendIn: number; error?: string };

const secure = process.env.NODE_ENV === 'production';

async function saveSession(tokens: Tokens | null) {
  const jar = await cookies();
  for (const c of sessionCookies(tokens, secure)) jar.set(c.name, c.value, c.options);
}

/** What to tell the customer when auth-service says no. */
function reason(err: unknown, fallback: string): string {
  if (err instanceof ApiError && (err.status === 429 || err.status === 503)) return err.message;
  if (err instanceof ApiError && err.status === 401) return 'That code is wrong or has expired.';
  if (err instanceof ApiError && err.status === 400) return fallback;
  throw err;
}

async function sendCode(rawPhone: string): Promise<LoginState> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { step: 'phone', phone: rawPhone, error: 'Enter a Pakistani mobile number, e.g. 0300 1234567.' };
  try {
    const sent = await requestCode(phone);
    return { step: 'code', phone: sent.phone, resendIn: sent.resendIn };
  } catch (err) {
    return {
      step: 'phone',
      phone: rawPhone,
      error: reason(err, 'Enter a Pakistani mobile number, e.g. 0300 1234567.'),
    };
  }
}

/**
 * The sign-in form's one action. `intent` says which button was pressed:
 * send (or resend) the code, verify it, or start again with another number.
 */
export async function submitLogin(state: LoginState, form: FormData): Promise<LoginState> {
  const intent = form.get('intent');
  if (intent === 'change') return { step: 'phone', phone: state.phone };
  if (intent === 'send') return sendCode(String(form.get('phone') ?? state.phone ?? ''));
  if (state.step !== 'code') return state;

  const code = String(form.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return { ...state, error: 'Enter the 6-digit code.' };
  let session: Awaited<ReturnType<typeof verifyCode>>;
  try {
    session = await verifyCode(state.phone, code);
  } catch (err) {
    return { ...state, error: reason(err, 'Enter the 6-digit code.') };
  }
  await saveSession(session);
  redirect(safeNext(form.get('next'), '/restaurants'));
}

/** Ends the session here and at auth-service, so the refresh token can't be used again. */
export async function logout() {
  const refresh = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refresh) await revoke(refresh).catch(() => undefined);
  await saveSession(null);
  redirect('/');
}
