import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' })).toMatchObject({
      PORT: 3006,
      CART_SERVICE_URL: 'http://localhost:3005',
      USER_SERVICE_URL: 'http://localhost:3002',
      RESTAURANT_SERVICE_URL: 'http://localhost:3003',
      SERVICE_TIMEOUT_MS: 3000,
      RIDE_MINUTES: 15,
    });
  });

  it('fails fast without DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a service URL that is not a URL', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://u:p@h/db', CART_SERVICE_URL: 'cart' })).toThrow(/CART_SERVICE_URL/);
  });
});

describe('loadConfig: Kafka', () => {
  const base = { DATABASE_URL: 'postgres://u:p@h/db' };

  it('leaves Kafka off when KAFKA_BROKERS is unset', () => {
    expect(loadConfig(base).KAFKA_BROKERS).toBeUndefined();
  });

  it('treats an empty KAFKA_BROKERS as unset', () => {
    expect(loadConfig({ ...base, KAFKA_BROKERS: ' ' }).KAFKA_BROKERS).toBeUndefined();
  });

  it('splits the broker list', () => {
    expect(loadConfig({ ...base, KAFKA_BROKERS: 'kafka:29092, kafka-2:29092' }).KAFKA_BROKERS).toEqual(['kafka:29092', 'kafka-2:29092']);
  });

  it('rejects a broker without a port', () => {
    expect(() => loadConfig({ ...base, KAFKA_BROKERS: 'kafka' })).toThrow(/KAFKA_BROKERS/);
  });
});
