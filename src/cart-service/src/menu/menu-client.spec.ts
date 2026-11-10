import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ServiceUnavailableException } from '@nestjs/common';
import { loadConfig } from '../config/config';
import { MenuClient } from './menu-client';

let reply: () => { status: number; body?: unknown; delayMs?: number };
let lastRequest: { url?: string; body: string };
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lastRequest = { url: req.url, body };
      const { status, body: out, delayMs = 0 } = reply();
      setTimeout(
        () =>
          res
            .writeHead(status, { 'content-type': 'application/json' })
            .end(out === undefined ? '' : JSON.stringify(out)),
        delayMs,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const client = (url = baseUrl) =>
  new MenuClient(loadConfig({ REDIS_URL: 'redis://localhost', MENU_SERVICE_URL: url, MENU_SERVICE_TIMEOUT_MS: '200' }));
const lines = [{ itemId: 'i1', quantity: 2, optionIds: [] }];

describe('MenuClient', () => {
  it('posts the lines and returns the prices', async () => {
    const priced = {
      restaurantId: 'r1',
      lines: [{ itemId: 'i1', name: 'Biryani', quantity: 2, options: [], unitPricePaisa: 100, lineTotalPaisa: 200 }],
      subtotalPaisa: 200,
    };
    reply = () => ({ status: 200, body: priced });
    await expect(client().price('r1', lines)).resolves.toEqual({ ok: true, lines: priced.lines, subtotalPaisa: 200 });
    expect(lastRequest).toEqual({ url: '/restaurants/r1/price', body: JSON.stringify({ lines }) });
  });

  it('turns 422 into problems with line numbers', async () => {
    reply = () => ({
      status: 422,
      body: { statusCode: 422, message: ['lines[0]: Biryani is sold out', 'odd message'] },
    });
    await expect(client().price('r1', lines)).resolves.toEqual({
      ok: false,
      problems: [
        { line: 0, message: 'Biryani is sold out' },
        { line: null, message: 'odd message' },
      ],
    });
  });

  it.each([
    ['an error status', () => ({ status: 500, body: {} })],
    ['a slow answer', () => ({ status: 200, body: {}, delayMs: 1000 })],
  ])('fails with 503 on %s', async (_, r) => {
    reply = r;
    await expect(client().price('r1', lines)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails with 503 when menu-service is down', async () => {
    await expect(client('http://127.0.0.1:1').price('r1', lines)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
