import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from './health.controller';

describe('health endpoints', () => {
  let app: INestApplication;
  const db = { execute: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: getDrizzleToken(), useValue: db }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /healthz returns ok without touching the database', async () => {
    db.execute.mockRejectedValue(new Error('down'));
    await request(app.getHttpServer()).get('/healthz').expect(200, { status: 'ok' });
  });

  it('GET /readyz returns ok when Postgres responds', async () => {
    db.execute.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/readyz').expect(200, { status: 'ok' });
  });

  it('GET /readyz returns 503 when Postgres is down', async () => {
    db.execute.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app.getHttpServer()).get('/readyz').expect(503);
    expect(res.body).toMatchObject({ status: 'unavailable', postgres: 'down' });
  });
});
