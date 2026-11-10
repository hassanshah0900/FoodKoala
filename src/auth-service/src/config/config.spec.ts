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

  const twilio = {
    SMS_PROVIDER: 'twilio',
    TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 'secret',
    TWILIO_FROM: `MG${'b'.repeat(32)}`,
  };

  it('accepts Twilio in production with all of its settings', () => {
    const key = 'pem';
    expect(loadConfig({ ...base, ...twilio, NODE_ENV: 'production', JWT_PRIVATE_KEY: key }).SMS_PROVIDER).toBe(
      'twilio',
    );
  });

  it('needs every Twilio setting, and treats empty ones as unset', () => {
    expect(() => loadConfig({ ...base, SMS_PROVIDER: 'twilio' })).toThrow(
      /TWILIO_ACCOUNT_SID[\s\S]*TWILIO_AUTH_TOKEN[\s\S]*TWILIO_FROM/,
    );
    expect(() => loadConfig({ ...base, ...twilio, TWILIO_AUTH_TOKEN: '' })).toThrow(/TWILIO_AUTH_TOKEN/);
    expect(loadConfig({ ...base, TWILIO_FROM: '' }).TWILIO_FROM).toBeUndefined();
    expect(() => loadConfig({ ...base, ...twilio, TWILIO_FROM: 'FoodKoala' })).toThrow(/TWILIO_FROM/);
  });
});
