import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' })).toMatchObject({
      PORT: 3003,
      MAX_ZONES_PER_RESTAURANT: 10,
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
