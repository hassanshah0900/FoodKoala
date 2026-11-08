import { Logger } from '@nestjs/common';

/** Why a message wasn't sent. Retryable ones (outages, rate limits) are tried again later. */
export class SmsError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface SmsSender {
  /** Resolves with the provider's message id once accepted for delivery. */
  send(phone: string, body: string): Promise<string>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/** Development: writes the text to the log instead of sending it. */
export class LogSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS');

  async send(phone: string, body: string): Promise<string> {
    this.logger.log(`To ${phone}: ${body}`);
    return `log-${Date.now()}`;
  }
}

/** Twilio's Messages API (https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource). */
export class TwilioSmsSender implements SmsSender {
  constructor(
    private readonly opts: { accountSid: string; authToken: string; from: string; apiUrl: string; timeoutMs: number },
  ) {}

  async send(phone: string, body: string): Promise<string> {
    const { accountSid, authToken, from, apiUrl, timeoutMs } = this.opts;
    const form = new URLSearchParams({ To: phone, Body: body });
    form.set(from.startsWith('MG') ? 'MessagingServiceSid' : 'From', from);
    let res: Response;
    try {
      res = await fetch(new URL(`/2010-04-01/Accounts/${accountSid}/Messages.json`, apiUrl), {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new SmsError(`Twilio unreachable: ${String(err)}`, true);
    }
    const reply = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
    if (res.ok && reply.sid) return reply.sid;
    // 429 and 5xx are worth another try; other 4xx (bad number, blocked) are not.
    const retryable = res.status === 429 || res.status >= 500;
    throw new SmsError(`Twilio answered ${res.status}${reply.code ? ` (${reply.code})` : ''}: ${reply.message ?? 'no message'}`, retryable);
  }
}
