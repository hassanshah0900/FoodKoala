import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { REDIS } from '../redis/redis.module';
import { HealthController } from './health.controller';

describe('health endpoints', () => {
  let app: INestApplication;
  const db = { execute: vi.fn() };
  const redis = { ping: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: getDrizzleToken(), useValue: db },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /healthz returns ok without touching dependencies', async () => {
    db.execute.mockRejectedValue(new Error('down'));
    await request(app.getHttpServer()).get('/healthz').expect(200, { status: 'ok' });
  });

  it('GET /readyz returns ok when Postgres and Redis respond', async () => {
    db.execute.mockResolvedValue([]);
    redis.ping.mockResolvedValue('PONG');
    await request(app.getHttpServer()).get('/readyz').expect(200, { status: 'ok' });
  });

  it('GET /readyz returns 503 and names the failing dependency', async () => {
    db.execute.mockResolvedValue([]);
    redis.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app.getHttpServer()).get('/readyz').expect(503);
    expect(res.body).toMatchObject({ status: 'unavailable', postgres: 'ok', redis: 'down' });
  });
});
