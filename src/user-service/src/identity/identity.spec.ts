import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CurrentUser, type Identity, IdentityGuard } from './identity';

@Controller()
@UseGuards(IdentityGuard)
class WhoAmIController {
  @Get('whoami')
  whoami(@CurrentUser() me: Identity) {
    return me;
  }
}

describe('IdentityGuard', () => {
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

  it('exposes the identity forwarded by the gateway', async () => {
    const res = await request(app.getHttpServer()).get('/whoami').set(valid).expect(200);
    expect(res.body).toEqual({
      userId: valid['X-User-Id'],
      phone: '+923001234567',
      roles: ['customer', 'vendor'],
    });
  });

  it.each([
    ['no headers', {}],
    ['missing user id', { ...valid, 'X-User-Id': '' }],
    ['user id not a uuid', { ...valid, 'X-User-Id': 'admin' }],
    ['missing phone', { 'X-User-Id': valid['X-User-Id'] }],
    ['phone not E.164 Pakistani mobile', { ...valid, 'X-User-Phone': '03001234567' }],
  ])('rejects %s with 401', async (_, headers) => {
    await request(app.getHttpServer()).get('/whoami').set(headers).expect(401);
  });
});
