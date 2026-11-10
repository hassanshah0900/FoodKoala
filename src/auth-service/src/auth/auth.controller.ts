import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SigningKeyService } from '../tokens/signing-key.service';
import {
  type OtpRequestDto,
  type OtpVerifyDto,
  otpRequestSchema,
  otpVerifySchema,
  type RefreshTokenDto,
  refreshTokenSchema,
} from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly keys: SigningKeyService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(@Body({ schema: otpRequestSchema }) body: OtpRequestDto) {
    return this.auth.requestOtp(body.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body({ schema: otpVerifySchema }) body: OtpVerifyDto) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Get('.well-known/jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  jwks() {
    return this.keys.jwks();
  }
}
