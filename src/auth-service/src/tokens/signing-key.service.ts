import { createPublicKey } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { type CryptoKey, calculateJwkThumbprint, exportJWK, generateKeyPair, importPKCS8, type JWK } from 'jose';
import { APP_CONFIG, type AppConfig } from '../config/config';

export const ALG = 'RS256';

/** Holds the RS256 signing key and the public JWK published at /.well-known/jwks.json. */
@Injectable()
export class SigningKeyService implements OnModuleInit {
  private readonly logger = new Logger(SigningKeyService.name);
  private privateKey!: CryptoKey;
  private publicJwk!: JWK;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    let publicJwk: JWK;
    if (this.config.JWT_PRIVATE_KEY) {
      const pem = this.config.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
      this.privateKey = await importPKCS8(pem, ALG);
      publicJwk = createPublicKey(pem).export({ format: 'jwk' }) as JWK;
    } else {
      // Only reachable outside production (enforced by config validation).
      this.logger.warn('JWT_PRIVATE_KEY not set: using a temporary key; tokens die on restart');
      const pair = await generateKeyPair(ALG, { extractable: true });
      this.privateKey = pair.privateKey;
      publicJwk = await exportJWK(pair.publicKey);
    }
    const kid = await calculateJwkThumbprint(publicJwk);
    this.publicJwk = { kty: 'RSA', n: publicJwk.n, e: publicJwk.e, kid, alg: ALG, use: 'sig' };
  }

  get key(): CryptoKey {
    return this.privateKey;
  }

  get kid(): string {
    return this.publicJwk.kid!;
  }

  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }
}
