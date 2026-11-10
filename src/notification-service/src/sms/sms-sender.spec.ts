import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { retryDelayMs } from './sms-dispatcher';
import { SmsError, TwilioSmsSender } from './sms-sender';

describe('TwilioSmsSender', () => {
  let server: Server;
  let apiUrl: string;
  let reply: { status: number; body: object };
  let seen: { url?: string; auth?: string; form?: URLSearchParams };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        seen = { url: req.url, auth: req.headers.authorization, form: new URLSearchParams(raw) };
        res.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((r) => server.close(r)));

  const sid = `AC${'1'.repeat(32)}`;
  const sender = (from = '+15005550006') =>
    new TwilioSmsSender({ accountSid: sid, authToken: 'tok', from, apiUrl, timeoutMs: 1000 });

  it('posts the message with basic auth and returns the message sid', async () => {
    reply = { status: 201, body: { sid: 'SM123' } };
    await expect(sender().send('+923001234567', 'Hello')).resolves.toBe('SM123');
    expect(seen.url).toBe(`/2010-04-01/Accounts/${sid}/Messages.json`);
    expect(seen.auth).toBe(`Basic ${Buffer.from(`${sid}:tok`).toString('base64')}`);
    expect(Object.fromEntries(seen.form!)).toEqual({ To: '+923001234567', Body: 'Hello', From: '+15005550006' });
  });

  it('sends through a Messaging Service when given one', async () => {
    reply = { status: 201, body: { sid: 'SM124' } };
    const service = `MG${'2'.repeat(32)}`;
    await sender(service).send('+923001234567', 'Hi');
    expect(seen.form!.get('MessagingServiceSid')).toBe(service);
    expect(seen.form!.has('From')).toBe(false);
  });

  it('gives up on a bad number and retries an outage or rate limit', async () => {
    reply = { status: 400, body: { code: 21211, message: "The 'To' number is not valid." } };
    await expect(sender().send('+920', 'x')).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('21211'),
    });
    for (const status of [429, 503]) {
      reply = { status, body: {} };
      await expect(sender().send('+923001234567', 'x')).rejects.toMatchObject({ retryable: true });
    }
  });

  it('retries when Twilio is unreachable', async () => {
    const down = new TwilioSmsSender({
      accountSid: sid,
      authToken: 't',
      from: '+15005550006',
      apiUrl: 'http://127.0.0.1:1',
      timeoutMs: 500,
    });
    await expect(down.send('+923001234567', 'x')).rejects.toEqual(expect.any(SmsError));
    await expect(down.send('+923001234567', 'x')).rejects.toMatchObject({ retryable: true });
  });
});

describe('retryDelayMs', () => {
  it('doubles from 30 seconds', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
  });
});
