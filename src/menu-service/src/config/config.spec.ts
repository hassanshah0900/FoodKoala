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

  it('fails fast without DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
