import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { call, UnavailableService } from './http';

describe('call', () => {
  let server: Server;
  let base: string;
  let reply: { status: number; body: string; delayMs?: number };
  let seen: { url?: string; headers?: Record<string, unknown> };

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen = { url: req.url, headers: req.headers };
      setTimeout(() => res.writeHead(reply.status, { 'content-type': 'application/json' }).end(reply.body), reply.delayMs ?? 0);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/base`;
  });

  afterAll(() => new Promise((r) => server.close(r)));

  const me = { userId: '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10', phone: '+923001234567', roles: ['customer', 'vendor'] };

  it('forwards identity headers and query, and returns the answer', async () => {
    reply = { status: 404, body: '{"statusCode":404}' };
    const res = await call('svc', base, 'me/x', { as: me, query: { lat: 24.9, lng: 67.1 }, timeoutMs: 1000 });
    expect(res).toEqual({ status: 404, body: { statusCode: 404 } });
    expect(seen.url).toBe('/base/me/x?lat=24.9&lng=67.1');
    expect(seen.headers).toMatchObject({ 'x-user-id': me.userId, 'x-user-phone': me.phone, 'x-user-roles': 'customer,vendor' });
  });

  it('sends no identity headers when calling anonymously', async () => {
    reply = { status: 200, body: '{}' };
    await call('svc', base, 'x', { timeoutMs: 1000 });
    expect(seen.headers?.['x-user-id']).toBeUndefined();
  });

  it('fails closed on a 5xx', async () => {
    reply = { status: 502, body: '' };
    await expect(call('svc', base, 'x', { timeoutMs: 1000 })).rejects.toThrow(UnavailableService);
  });

  it('fails closed on a timeout', async () => {
    reply = { status: 200, body: '{}', delayMs: 300 };
    await expect(call('svc', base, 'x', { timeoutMs: 50 })).rejects.toThrow('Could not reach svc; try again');
  });

  it('fails closed when nothing listens', async () => {
    await expect(call('svc', 'http://127.0.0.1:1', 'x', { timeoutMs: 1000 })).rejects.toThrow(UnavailableService);
  });
});
