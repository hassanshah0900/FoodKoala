import { clockTime, deliveryWindow, distance, ratingCount, rupees } from './format';

describe('format', () => {
  it.each([
    [50000, 'Rs 500'],
    [49950, 'Rs 499.50'],
    [12345600, 'Rs 123,456'],
  ])('%i paisa reads as %s', (paisa, text) => expect(rupees(paisa)).toBe(text));

  it('gives the delivery time as a range', () => expect(deliveryWindow(30)).toBe('30–40 min'));

  it.each([
    [843, '840 m'],
    [2440, '2.4 km'],
  ])('%i m reads as %s', (m, text) => expect(distance(m)).toBe(text));

  it.each([
    [37, '37'],
    [100, '100+'],
    [740, '500+'],
    [1250, '1,000+'],
    [23_400, '20,000+'],
  ])('%i ratings read as %s', (n, text) => expect(ratingCount(n)).toBe(text));

  it('shows times in Pakistan', () => expect(clockTime('2026-11-10T08:30:00Z')).toBe('13:30'));
});
