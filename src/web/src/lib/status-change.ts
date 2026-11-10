import 'server-only';

import { refusal } from '@/lib/api/http';

export type StatusChangeState = { error?: string };

/**
 * Reads the status (the pressed button's value) and reason from a status form,
 * runs the change, and turns the service's refusal into a message on the form.
 */
export async function statusChange(
  form: FormData,
  apply: (to: string, reason: string | undefined) => Promise<void>,
): Promise<StatusChangeState> {
  const to = String(form.get('to') ?? '');
  const reason = String(form.get('reason') ?? '').trim() || undefined;
  if (form.get('needsReason') === 'true' && !reason) return { error: 'Write a reason; it is shown to them.' };
  try {
    await apply(to, reason);
    return {};
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { error };
  }
}
