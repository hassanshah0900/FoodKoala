'use client';

import { useActionState, useEffect, useState } from 'react';
import { type LoginState, submitLogin } from '@/app/(shop)/login/actions';
import { formatPhone } from '@/lib/phone';

const field =
  'h-12 w-full rounded-lg border border-line px-4 text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';
const primary =
  'h-12 w-full rounded-lg bg-brand-600 font-bold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60';

/** Seconds left before another code may be asked for. */
function useCountdown(from: number) {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    setLeft(from);
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [from]);
  return left;
}

function CodeStep({
  state,
  next,
  pending,
}: {
  state: Extract<LoginState, { step: 'code' }>;
  next: string;
  pending: boolean;
}) {
  const resendIn = useCountdown(state.resendIn);
  return (
    <>
      <p className="text-sm text-muted">
        Enter the 6-digit code we texted to <span className="font-semibold text-ink">{formatPhone(state.phone)}</span>.
      </p>
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="sr-only">Code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          // biome-ignore lint/a11y/noAutofocus: the code is the only thing to do on this step.
          autoFocus
          placeholder="••••••"
          className={`${field} text-center text-2xl tracking-[0.5em]`}
        />
      </label>
      <button type="submit" name="intent" value="verify" disabled={pending} className={primary}>
        {pending ? 'Checking…' : 'Log in'}
      </button>
      <div className="flex justify-between text-sm">
        <button
          type="submit"
          name="intent"
          value="change"
          formNoValidate
          className="font-semibold text-brand-600 hover:underline"
        >
          Change number
        </button>
        <button
          type="submit"
          name="intent"
          value="send"
          formNoValidate
          disabled={resendIn > 0 || pending}
          className="font-semibold text-brand-600 hover:underline disabled:text-muted disabled:no-underline"
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
        </button>
      </div>
    </>
  );
}

/** Phone number, then the texted code. One form, whose buttons say what to do (see submitLogin). */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(submitLogin, { step: 'phone' } as LoginState);
  return (
    <form action={action} className="space-y-4" noValidate={state.step === 'phone'}>
      {state.step === 'phone' ? (
        <>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Mobile number</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              defaultValue={state.phone}
              placeholder="0300 1234567"
              required
              className={field}
            />
          </label>
          <button type="submit" name="intent" value="send" disabled={pending} className={primary}>
            {pending ? 'Sending code…' : 'Continue'}
          </button>
        </>
      ) : (
        <CodeStep state={state} next={next} pending={pending} />
      )}
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
    </form>
  );
}
