import { Module } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
import { LogSmsSender, SmsSender } from '../sms/sms.sender';
import { AccessTokenService } from '../tokens/access-token.service';
import { RefreshTokenService } from '../tokens/refresh-token.service';
import { SigningKeyService } from '../tokens/signing-key.service';
import { UsersRepository } from '../users/users.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    UsersRepository,
    SigningKeyService,
    AccessTokenService,
    RefreshTokenService,
    // SMS_PROVIDER only allows `log` for now; a real provider plugs in here.
    { provide: SmsSender, useClass: LogSmsSender },
  ],
})
export class AuthModule {}
