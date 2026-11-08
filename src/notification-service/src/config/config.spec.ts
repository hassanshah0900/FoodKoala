import { loadConfig } from './config';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };
const twilio = {
  SMS_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'secret',
  TWILIO_FROM: '+15005550006',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(base)).toMatchObject({
      PORT: 3007,
      KAFKA_GROUP_ID: 'notification-service',
      SMS_PROVIDER: 'log',
      SMS_MAX_ATTEMPTS: 5,
    });
  });

  it('fails fast without DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('splits the broker list and treats an empty one as unset', () => {
    expect(loadConfig({ ...base, KAFKA_BROKERS: 'kafka:29092,k2:9092' }).KAFKA_BROKERS).toEqual(['kafka:29092', 'k2:9092']);
    expect(loadConfig({ ...base, KAFKA_BROKERS: '' }).KAFKA_BROKERS).toBeUndefined();
  });

  it('refuses the log provider in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/SMS_PROVIDER/);
    expect(loadConfig({ ...base, NODE_ENV: 'production', ...twilio }).SMS_PROVIDER).toBe('twilio');
  });

  it('needs every Twilio setting for Twilio', () => {
    expect(() => loadConfig({ ...base, SMS_PROVIDER: 'twilio' })).toThrow(/TWILIO_ACCOUNT_SID[\s\S]*TWILIO_AUTH_TOKEN[\s\S]*TWILIO_FROM/);
    expect(() => loadConfig({ ...base, ...twilio, TWILIO_FROM: 'FoodKoala' })).toThrow(/TWILIO_FROM/);
  });
});
