import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import { RateLimitedException } from '../common/rate-limited.exception';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { REDIS } from '../redis/redis.module';
import { SmsSender } from '../sms/sms.sender';

export interface OtpRequested {
  phone: string;
  expiresIn: number;
  resendIn: number;
}

const keys = {
  code: (phone: string) => `auth:otp:code:${phone}`,
  cooldown: (phone: string) => `auth:otp:cooldown:${phone}`,
  hourly: (phone: string) => `auth:otp:hourly:${phone}`,
};

@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sms: SmsSender,
  ) {}

  /** Generates a code, stores its hash and sends it. Throws RateLimitedException when asked too often. */
  async request(phone: string): Promise<OtpRequested> {
    const { OTP_TTL_SECONDS, OTP_RESEND_SECONDS, OTP_MAX_PER_HOUR } = this.config;

    const cooled = await this.redis.set(keys.cooldown(phone), '1', 'EX', OTP_RESEND_SECONDS, 'NX');
    if (cooled !== 'OK') {
      throw new RateLimitedException(
        'Please wait before requesting another code',
        await this.redis.ttl(keys.cooldown(phone)),
      );
    }

    const [[, sent]] = (await this.redis
      .multi()
      .incr(keys.hourly(phone))
      .expire(keys.hourly(phone), 3600, 'NX')
      .exec()) as [[null, number], [null, number]];
    if (sent > OTP_MAX_PER_HOUR) {
      throw new RateLimitedException(
        'Too many codes requested, try again later',
        await this.redis.ttl(keys.hourly(phone)),
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    // Overwrites any previous code, which invalidates it.
    await this.redis
      .multi()
      .hset(keys.code(phone), { hash: this.hash(phone, code), attempts: 0 })
      .expire(keys.code(phone), OTP_TTL_SECONDS)
      .exec();

    await this.sms.send(phone, `${code} is your FoodKoala login code. It expires in ${Math.round(OTP_TTL_SECONDS / 60)} minutes.`);

    return { phone, expiresIn: OTP_TTL_SECONDS, resendIn: OTP_RESEND_SECONDS };
  }

  /** Consumes the code if it matches. A code works once and is dropped after too many wrong attempts. */
  async verify(phone: string, code: string): Promise<void> {
    const key = keys.code(phone);
    const stored = await this.redis.hget(key, 'hash');
    if (!stored) throw new UnauthorizedException('Code expired or not requested');

    const attempts = await this.redis.hincrby(key, 'attempts', 1);
    if (attempts > this.config.OTP_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new RateLimitedException('Too many wrong attempts, request a new code', 0);
    }

    if (!this.matches(stored, this.hash(phone, code))) {
      throw new UnauthorizedException('Wrong code');
    }

    // Only the request that deletes the key wins, so a code cannot be used twice concurrently.
    if ((await this.redis.del(key)) !== 1) {
      throw new UnauthorizedException('Code expired or not requested');
    }
    await this.redis.del(keys.cooldown(phone));
  }

  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.config.OTP_PEPPER).update(`${phone}:${code}`).digest('hex');
  }

  private matches(a: string, b: string): boolean {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && timingSafeEqual(x, y);
  }
}
