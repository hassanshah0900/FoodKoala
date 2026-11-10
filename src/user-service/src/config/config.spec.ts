import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' })).toMatchObject({
      PORT: 3002,
      MAX_ADDRESSES_PER_USER: 10,
      MAX_FAVOURITES_PER_USER: 100,
      RESTAURANT_SERVICE_URL: 'http://localhost:3003',
      RESTAURANT_SERVICE_TIMEOUT_MS: 2000,
    });
  });

  it('fails fast without DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
