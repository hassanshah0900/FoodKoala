import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { maskPhone } from '../otp/otp.service';
import { TwilioSmsSender } from './twilio.sender';

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

  const accountSid = `AC${'1'.repeat(32)}`;
  const sender = (from: string) => new TwilioSmsSender({ accountSid, authToken: 'tok', from, apiUrl, timeoutMs: 1000 });

  it('sends from a number with basic auth', async () => {
    reply = { status: 201, body: { sid: 'SM1' } };
    await sender('+15005550006').send('+923001234567', '123456 is your FoodKoala login code.');
    expect(seen.url).toBe(`/2010-04-01/Accounts/${accountSid}/Messages.json`);
    expect(seen.auth).toBe(`Basic ${Buffer.from(`${accountSid}:tok`).toString('base64')}`);
    expect(Object.fromEntries(seen.form!)).toEqual({
      To: '+923001234567',
      Body: '123456 is your FoodKoala login code.',
      From: '+15005550006',
    });
  });

  it('sends through a Messaging Service', async () => {
    reply = { status: 201, body: { sid: 'SM2' } };
    const service = `MG${'2'.repeat(32)}`;
    await sender(service).send('+923001234567', 'x');
    expect(seen.form!.get('MessagingServiceSid')).toBe(service);
  });

  it("throws with Twilio's error when it refuses", async () => {
    reply = { status: 400, body: { code: 21211, message: "The 'To' number is not valid." } };
    await expect(sender('+15005550006').send('+920', 'x')).rejects.toThrow(
      "Twilio answered 400 (21211): The 'To' number is not valid.",
    );
  });

  it('throws when Twilio is unreachable', async () => {
    const down = new TwilioSmsSender({
      accountSid,
      authToken: 't',
      from: '+15005550006',
      apiUrl: 'http://127.0.0.1:1',
      timeoutMs: 500,
    });
    await expect(down.send('+923001234567', 'x')).rejects.toThrow();
  });
});

describe('maskPhone', () => {
  it('keeps the network prefix and the last four digits', () => {
    expect(maskPhone('+923001234567')).toBe('+92300***4567');
  });
});
