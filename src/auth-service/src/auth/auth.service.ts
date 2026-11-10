import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Role, User } from '../db/schema';
import { OtpService } from '../otp/otp.service';
import { AccessTokenService } from '../tokens/access-token.service';
import { RefreshTokenService } from '../tokens/refresh-token.service';
import { UsersRepository } from '../users/users.repository';

export interface Session {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  isNewUser?: boolean;
  user: { id: string; phone: string; roles: Role[] };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly users: UsersRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  requestOtp(phone: string) {
    return this.otp.request(phone);
  }

  async verifyOtp(phone: string, code: string): Promise<Session> {
    await this.otp.verify(phone, code);
    const found = await this.users.findOrCreateByPhone(phone);
    const user = this.config.ADMIN_PHONES.includes(phone)
      ? await this.users.grantRole(found.user, 'admin')
      : found.user;
    const refreshToken = await this.refreshTokens.issue(user.id);
    return { ...(await this.session(user, refreshToken)), isNewUser: found.isNew };
  }

  async refresh(token: string): Promise<Session> {
    const { user, refreshToken } = await this.refreshTokens.rotate(token);
    return this.session(user, refreshToken);
  }

  logout(token: string): Promise<void> {
    return this.refreshTokens.revoke(token);
  }

  private async session(user: User, refreshToken: string): Promise<Session> {
    return {
      accessToken: await this.accessTokens.sign(user),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokens.ttlSeconds,
      user: { id: user.id, phone: user.phone, roles: user.roles },
    };
  }
}
