import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { loadConfig } from '../config/config';
import type { Identity } from '../identity/identity';
import { RestaurantAccess } from './restaurant-access';

const owner: Identity = { userId: '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10', phone: '+923001234567', roles: ['customer'] };
const stranger: Identity = {
  userId: '0b9d1c7e-3f5a-4c2e-9a1b-6d8e7f0a1b2c',
  phone: '+923007654321',
  roles: ['customer'],
};
const admin: Identity = { ...stranger, roles: ['customer', 'admin'] };

/** A stand-in restaurant-service: answers by restaurant id. */
let reply: (id: string) => { status: number; body?: unknown; delayMs?: number };
let lastHeaders: IncomingHttpHeaders;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers;
    const { status, body, delayMs = 0 } = reply(req.url!.slice(1));
    setTimeout(() => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body));
    }, delayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const access = (url = baseUrl) =>
  new RestaurantAccess(
    loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost/db',
      RESTAURANT_SERVICE_URL: url,
      RESTAURANT_SERVICE_TIMEOUT_MS: '200',
    }),
  );
const id = 'e0c1d2b3-a4f5-4678-9abc-def012345678';

describe('RestaurantAccess', () => {
  it('lets the owner through, forwarding their identity', async () => {
    reply = () => ({ status: 200, body: { id, ownerId: owner.userId, status: 'approved' } });
    await expect(access().assertCanManage(owner, id)).resolves.toBeUndefined();
    expect(lastHeaders).toMatchObject({
      'x-user-id': owner.userId,
      'x-user-phone': owner.phone,
      'x-user-roles': 'customer',
    });
  });

  it('refuses someone who only sees the public view', async () => {
    reply = () => ({ status: 200, body: { id, name: 'Karachi Biryani House' } });
    await expect(access().assertCanManage(stranger, id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets admins through', async () => {
    reply = () => ({ status: 200, body: { id, ownerId: owner.userId } });
    await expect(access().assertCanManage(admin, id)).resolves.toBeUndefined();
  });

  it('passes on 404', async () => {
    reply = () => ({ status: 404, body: { statusCode: 404 } });
    await expect(access().assertCanManage(owner, id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['an error status', () => ({ status: 500, body: {} })],
    ['a body that is not JSON', () => ({ status: 200 })],
    ['a slow answer', () => ({ status: 200, body: { ownerId: owner.userId }, delayMs: 1000 })],
  ])('fails closed with 503 on %s', async (_, r) => {
    reply = r;
    await expect(access().assertCanManage(owner, id)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed with 503 when restaurant-service is down', async () => {
    await expect(access('http://127.0.0.1:1').assertCanManage(owner, id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
