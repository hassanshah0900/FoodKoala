// A stand-in for Twilio's Messages API, so the end-to-end tests can read what
// FoodKoala texts people: login codes from auth-service and alerts from
// notification-service. It keeps every message in memory and never sends one.
//
//   POST /2010-04-01/Accounts/{sid}/Messages.json   what the services call (as Twilio)
//   GET  /messages?to=+923001234567                  what the tests read, oldest first
//   GET  /healthz
//
// Node runs this TypeScript file directly (type stripping), so it needs no build.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

interface Sms {
  to: string;
  body: string;
  at: string;
}

const sent: Sms[] = [];

const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://fake-sms');

  if (req.method === 'POST' && /^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(url.pathname)) {
    const form = new URLSearchParams(await readBody(req));
    const to = form.get('To');
    const body = form.get('Body');
    if (!to || !body) return reply(res, 400, { code: 21604, message: 'To and Body are required' });
    sent.push({ to, body, at: new Date().toISOString() });
    return reply(res, 201, { sid: `SM${sent.length.toString().padStart(32, '0')}`, status: 'queued' });
  }

  if (req.method === 'GET' && url.pathname === '/messages') {
    const to = url.searchParams.get('to');
    return reply(
      res,
      200,
      sent.filter((m) => !to || m.to === to),
    );
  }

  if (req.method === 'GET' && url.pathname === '/healthz') return reply(res, 200, { ok: true });

  reply(res, 404, { message: 'not found' });
});

server.listen(Number(process.env.PORT ?? 4010), () => console.log('fake SMS listening'));
