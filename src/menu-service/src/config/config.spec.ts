import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' })).toMatchObject({
      PORT: 3004,
      RESTAURANT_SERVICE_URL: 'http://localhost:3003',
      RESTAURANT_SERVICE_TIMEOUT_MS: 2000,
      MAX_CATEGORIES_PER_RESTAURANT: 50,
      MAX_ITEMS_PER_RESTAURANT: 300,
    });
  });

  it('leaves Kafka off unless KAFKA_BROKERS is set, and splits the list', () => {
    const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };
    expect(loadConfig(base).KAFKA_BROKERS).toBeUndefined();
    expect(loadConfig({ ...base, KAFKA_BROKERS: ' ' }).KAFKA_BROKERS).toBeUndefined();
    expect(loadConfig({ ...base, KAFKA_BROKERS: 'kafka:29092, kafka-2:29092' }).KAFKA_BROKERS).toEqual([
      'kafka:29092',
      'kafka-2:29092',
    ]);
    expect(() => loadConfig({ ...base, KAFKA_BROKERS: 'kafka' })).toThrow(/KAFKA_BROKERS/);
  });

  it('fails fast without DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
