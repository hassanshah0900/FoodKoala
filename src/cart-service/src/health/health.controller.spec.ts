import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { REDIS } from '../redis/redis.module';
import { HealthController } from './health.controller';

describe('health endpoints', () => {
  let app: INestApplication;
  const redis = { ping: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: REDIS, useValue: redis }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /healthz returns ok without touching Redis', async () => {
    redis.ping.mockRejectedValue(new Error('down'));
    await request(app.getHttpServer()).get('/healthz').expect(200, { status: 'ok' });
  });

  it('GET /readyz returns ok when Redis answers', async () => {
    redis.ping.mockResolvedValue('PONG');
    await request(app.getHttpServer()).get('/readyz').expect(200, { status: 'ok' });
  });

  it('GET /readyz returns 503 when Redis is down', async () => {
    redis.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app.getHttpServer()).get('/readyz').expect(503);
    expect(res.body).toMatchObject({ status: 'unavailable', redis: 'down' });
  });
});
