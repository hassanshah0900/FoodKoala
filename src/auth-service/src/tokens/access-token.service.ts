import { Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { User } from '../db/schema';
import { ALG, SigningKeyService } from './signing-key.service';

@Injectable()
export class AccessTokenService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly keys: SigningKeyService,
  ) {}

  get ttlSeconds(): number {
    return this.config.ACCESS_TOKEN_TTL_SECONDS;
  }

  /** Claims are documented as AccessTokenClaims in contracts/openapi/auth-service.yaml. */
  sign(user: Pick<User, 'id' | 'phone' | 'roles'>): Promise<string> {
    return new SignJWT({ phone: user.phone, roles: user.roles })
      .setProtectedHeader({ alg: ALG, kid: this.keys.kid, typ: 'JWT' })
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${this.config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.keys.key);
  }
}
