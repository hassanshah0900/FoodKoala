import { UnauthorizedException } from '@nestjs/common';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { RateLimitedException } from '../common/rate-limited.exception';
import { SmsSender } from '../sms/sms.sender';
import { testConfig } from '../test-config';
import { OtpService } from './otp.service';

const PHONE = '+923001234567';

class CapturingSms extends SmsSender {
  last?: { phone: string; code: string };
  async send(phone: string, message: string) {
    this.last = { phone, code: /\b(\d{6})\b/.exec(message)![1] };
  }
}

describe('OtpService', () => {
  let redis: Redis;
  let sms: CapturingSms;
  let otp: OtpService;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    await redis.flushall();
    sms = new CapturingSms();
    otp = new OtpService(redis, testConfig(), sms);
  });

  it('sends a 6-digit code and verifies it once', async () => {
    await expect(otp.request(PHONE)).resolves.toEqual({ phone: PHONE, expiresIn: 300, resendIn: 60 });
    expect(sms.last).toEqual({ phone: PHONE, code: expect.stringMatching(/^\d{6}$/) });

    await expect(otp.verify(PHONE, sms.last!.code)).resolves.toBeUndefined();
    await expect(otp.verify(PHONE, sms.last!.code)).rejects.toThrow(UnauthorizedException);
  });

  it('never stores the code in plain text', async () => {
    await otp.request(PHONE);
    const stored = await redis.hgetall(`auth:otp:code:${PHONE}`);
    expect(JSON.stringify(stored)).not.toContain(sms.last!.code);
  });

  it('rejects a wrong code and drops the code after too many attempts', async () => {
    await otp.request(PHONE);
    const wrong = sms.last!.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(otp.verify(PHONE, wrong)).rejects.toThrow('Wrong code');
    }
    await expect(otp.verify(PHONE, sms.last!.code)).rejects.toThrow(RateLimitedException);
    await expect(otp.verify(PHONE, sms.last!.code)).rejects.toThrow('Code expired or not requested');
  });

  it('enforces the resend cooldown with a Retry-After', async () => {
    await otp.request(PHONE);
    const err = await otp.request(PHONE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedException);
    expect((err as RateLimitedException).retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows at most 5 codes per hour', async () => {
    for (let i = 0; i < 5; i++) {
      await otp.request(PHONE);
      await redis.del(`auth:otp:cooldown:${PHONE}`); // skip the 60s wait
    }
    await expect(otp.request(PHONE)).rejects.toThrow('Too many codes requested');
  });

  it('invalidates the previous code when a new one is sent', async () => {
    await otp.request(PHONE);
    const first = sms.last!.code;
    await redis.del(`auth:otp:cooldown:${PHONE}`);
    await otp.request(PHONE);
    if (first !== sms.last!.code) {
      await expect(otp.verify(PHONE, first)).rejects.toThrow('Wrong code');
    }
    await expect(otp.verify(PHONE, sms.last!.code)).resolves.toBeUndefined();
  });
});
