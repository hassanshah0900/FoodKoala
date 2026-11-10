import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import type Redis from 'ioredis';
import { createLocalJWKSet, jwtVerify } from 'jose';
import request from 'supertest';
import { AppModule } from '../app.module';
import type { Database } from '../db/database';
import { users } from '../db/schema';
import { REDIS } from '../redis/redis.module';
import { setupApp } from '../setup-app';
import { SmsSender } from '../sms/sms.sender';

class CapturingSms extends SmsSender {
  codes = new Map<string, string>();
  async send(phone: string, message: string) {
    this.codes.set(phone, /\b(\d{6})\b/.exec(message)![1]);
  }
}

// Random 03xx numbers per run so reruns don't collide.
const randomLocal = () => `03${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const local = randomLocal();
const PHONE = `+92${local.slice(1)}`;
const ADMIN = `+92${randomLocal().slice(1)}`;

describe('auth flow (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const sms = new CapturingSms();

  beforeAll(async () => {
    process.env.ADMIN_PHONES = ADMIN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SmsSender)
      .useValue(sms)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app
      .get<Database>(getDrizzleToken())
      .delete(users)
      .where(inArray(users.phone, [PHONE, ADMIN]));
    await app.close();
    delete process.env.ADMIN_PHONES;
  });

  async function login(phone = PHONE) {
    await app.get<Redis>(REDIS).del(`auth:otp:cooldown:${phone}`);
    await http.post('/otp/request').send({ phone }).expect(202);
    const res = await http
      .post('/otp/verify')
      .send({ phone, code: sms.codes.get(phone) })
      .expect(200);
    return res.body;
  }

  it('rejects numbers that are not Pakistani mobiles', async () => {
    const res = await http.post('/otp/request').send({ phone: '04235761234' }).expect(400);
    expect(res.body.message).toEqual([expect.stringMatching(/^phone: must be a Pakistani mobile number/)]);
  });

  it('rejects unknown fields', async () => {
    await http.post('/otp/request').send({ phone: local, role: 'admin' }).expect(400);
  });

  it('logs in a new user with a code and issues tokens that verify against the JWKS', async () => {
    const sent = await http.post('/otp/request').send({ phone: local }).expect(202);
    expect(sent.body).toEqual({ phone: PHONE, expiresIn: 300, resendIn: 60 });

    const again = await http.post('/otp/request').send({ phone: local }).expect(429);
    expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);

    await http.post('/otp/verify').send({ phone: PHONE, code: '12345' }).expect(400);

    const res = await http
      .post('/otp/verify')
      .send({ phone: PHONE, code: sms.codes.get(PHONE) })
      .expect(200);
    expect(res.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      isNewUser: true,
      user: { id: expect.any(String), phone: PHONE, roles: ['customer'] },
    });

    const jwks = await http.get('/.well-known/jwks.json').expect(200);
    expect(jwks.headers['cache-control']).toBe('public, max-age=300');
    const { payload } = await jwtVerify(res.body.accessToken, createLocalJWKSet(jwks.body), {
      issuer: 'foodkoala-auth',
      audience: 'foodkoala',
    });
    expect(payload).toMatchObject({ sub: res.body.user.id, phone: PHONE, roles: ['customer'] });

    // The code works only once.
    await http
      .post('/otp/verify')
      .send({ phone: PHONE, code: sms.codes.get(PHONE) })
      .expect(401);
  });

  it('returns the same user on later logins', async () => {
    const first = await login();
    const second = await login();
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('makes the numbers in ADMIN_PHONES admins, once', async () => {
    expect((await login(ADMIN)).user.roles).toEqual(['customer', 'admin']);
    const again = await login(ADMIN);
    expect(again.user.roles).toEqual(['customer', 'admin']);
    const refreshed = await http.post('/token/refresh').send({ refreshToken: again.refreshToken }).expect(200);
    expect(refreshed.body.user.roles).toEqual(['customer', 'admin']);
  });

  it('rotates refresh tokens and revokes the family when a used token is replayed', async () => {
    const session = await login();

    const r1 = await http.post('/token/refresh').send({ refreshToken: session.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(session.refreshToken);
    expect(r1.body.user.phone).toBe(PHONE);

    // Replaying the old token is treated as theft: it fails and kills the newer token too.
    await http.post('/token/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await http.post('/token/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it('logout revokes the refresh token, and is idempotent', async () => {
    const session = await login();
    await http.post('/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await http.post('/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await http.post('/token/refresh').send({ refreshToken: session.refreshToken }).expect(401);
  });

  it('is ready when Postgres and Redis are up', async () => {
    await http.get('/readyz').expect(200, { status: 'ok' });
  });
});
