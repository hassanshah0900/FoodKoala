import { Module } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { LogSmsSender, SmsSender } from '../sms/sms.sender';
import { TwilioSmsSender } from '../sms/twilio.sender';
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
    {
      provide: SmsSender,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): SmsSender =>
        c.SMS_PROVIDER === 'twilio'
          ? new TwilioSmsSender({
              accountSid: c.TWILIO_ACCOUNT_SID!,
              authToken: c.TWILIO_AUTH_TOKEN!,
              from: c.TWILIO_FROM!,
              apiUrl: c.TWILIO_API_URL,
              timeoutMs: c.SMS_TIMEOUT_MS,
            })
          : new LogSmsSender(),
    },
  ],
})
export class AuthModule {}
