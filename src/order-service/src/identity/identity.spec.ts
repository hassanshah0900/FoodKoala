import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard, CurrentUser, type Identity, IdentityGuard, OptionalUser } from './identity';

@Controller()
class WhoAmIController {
  @Get('whoami')
  @UseGuards(IdentityGuard)
  whoami(@CurrentUser() me: Identity) {
    return me;
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  admin(@CurrentUser() me: Identity) {
    return me;
  }

  @Get('public')
  public(@OptionalUser() me: Identity | undefined) {
    return { me: me ?? null };
  }
}

describe('identity', () => {
  let app: INestApplication;
  const valid = {
    'X-User-Id': '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10',
    'X-User-Phone': '+923001234567',
    'X-User-Roles': 'customer,vendor',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [WhoAmIController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  it('reads the identity headers', async () => {
    await request(app.getHttpServer())
      .get('/whoami')
      .set(valid)
      .expect(200, { userId: valid['X-User-Id'], phone: valid['X-User-Phone'], roles: ['customer', 'vendor'] });
  });

  it('rejects requests without identity headers', async () => {
    await request(app.getHttpServer()).get('/whoami').expect(401);
  });

  it.each([
    ['a non-uuid user id', { 'X-User-Id': 'admin' }],
    ['a non-Pakistani phone', { 'X-User-Phone': '+15551234567' }],
  ])('rejects %s', async (_, override) => {
    await request(app.getHttpServer())
      .get('/whoami')
      .set({ ...valid, ...override })
      .expect(401);
  });

  it('lets admins through AdminGuard and stops everyone else', async () => {
    await request(app.getHttpServer()).get('/admin').expect(401);
    await request(app.getHttpServer()).get('/admin').set(valid).expect(403);
    await request(app.getHttpServer())
      .get('/admin')
      .set({ ...valid, 'X-User-Roles': 'customer,admin' })
      .expect(200);
  });

  it('allows anonymous callers on public routes, but not malformed headers', async () => {
    await request(app.getHttpServer()).get('/public').expect(200, { me: null });
    const res = await request(app.getHttpServer()).get('/public').set(valid).expect(200);
    expect(res.body.me.userId).toBe(valid['X-User-Id']);
    await request(app.getHttpServer())
      .get('/public')
      .set({ ...valid, 'X-User-Id': 'nope' })
      .expect(401);
  });
});
