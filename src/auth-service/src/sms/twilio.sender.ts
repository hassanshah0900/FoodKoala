import { SmsSender } from './sms.sender';

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  /** A Messaging Service (MG...) or a sender number in E.164. */
  from: string;
  apiUrl: string;
  timeoutMs: number;
}

/**
 * Sends through Twilio's Messages API
 * (https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource).
 * Throws when Twilio is unreachable or refuses the message; the caller decides what the user sees.
 */
export class TwilioSmsSender extends SmsSender {
  constructor(private readonly opts: TwilioOptions) {
    super();
  }

  async send(phone: string, message: string): Promise<void> {
    const { accountSid, authToken, from, apiUrl, timeoutMs } = this.opts;
    const form = new URLSearchParams({ To: phone, Body: message });
    form.set(from.startsWith('MG') ? 'MessagingServiceSid' : 'From', from);
    const res = await fetch(new URL(`/2010-04-01/Accounts/${accountSid}/Messages.json`, apiUrl), {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return;
    const reply = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    throw new Error(`Twilio answered ${res.status}${reply.code ? ` (${reply.code})` : ''}: ${reply.message ?? 'no message'}`);
  }
}
