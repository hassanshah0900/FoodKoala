import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  OTP_PEPPER: 'a-long-enough-pepper',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({ PORT: 3001, OTP_TTL_SECONDS: 300, ACCESS_TOKEN_TTL_SECONDS: 900 });
  });

  it('lists every missing variable', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL[\s\S]*OTP_PEPPER/);
  });

  it('refuses to log OTPs or use a temporary signing key in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(
      /JWT_PRIVATE_KEY: required in production[\s\S]*SMS_PROVIDER/,
    );
  });
});
