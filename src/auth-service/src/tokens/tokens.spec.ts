import { generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { testConfig } from '../test-config';
import { AccessTokenService } from './access-token.service';
import { SigningKeyService } from './signing-key.service';

const user = { id: '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10', phone: '+923001234567', roles: ['customer' as const] };

async function setup(privateKeyPem?: string) {
  const config = testConfig(privateKeyPem ? { JWT_PRIVATE_KEY: privateKeyPem } : {});
  const keys = new SigningKeyService(config);
  await keys.onModuleInit();
  return { keys, tokens: new AccessTokenService(config, keys) };
}

describe('access tokens', () => {
  it('are RS256 JWTs that verify against the published JWKS', async () => {
    const { keys, tokens } = await setup();
    const jwt = await tokens.sign(user);

    const { payload, protectedHeader } = await jwtVerify(jwt, createLocalJWKSet(keys.jwks()), {
      issuer: 'foodkoala-auth',
      audience: 'foodkoala',
    });

    expect(protectedHeader).toMatchObject({ alg: 'RS256', kid: keys.kid, typ: 'JWT' });
    expect(payload).toMatchObject({ sub: user.id, phone: user.phone, roles: ['customer'] });
    expect(payload.exp! - payload.iat!).toBe(900);
  });

  it('publish only the public half of the key', async () => {
    const { keys } = await setup();
    const [jwk] = keys.jwks().keys;
    expect(Object.keys(jwk).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
  });

  it('load a PEM key from config, including escaped newlines from .env files', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const a = await setup(pem);
    const b = await setup(pem.replace(/\n/g, '\\n'));
    expect(a.keys.kid).toBe(b.keys.kid);

    const jwt = await a.tokens.sign(user);
    await expect(jwtVerify(jwt, createLocalJWKSet(b.keys.jwks()))).resolves.toBeDefined();
  });
});
