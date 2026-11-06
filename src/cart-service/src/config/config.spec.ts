import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({ REDIS_URL: 'redis://localhost:6379' })).toMatchObject({
      PORT: 3005,
      MENU_SERVICE_URL: 'http://localhost:3004',
      CART_TTL_DAYS: 7,
      MAX_CART_LINES: 50,
    });
  });

  it('fails fast without REDIS_URL', () => {
    expect(() => loadConfig({})).toThrow(/REDIS_URL/);
  });
});
