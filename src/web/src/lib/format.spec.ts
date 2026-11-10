import { ago, clockTime, dateTime, deliveryWindow, distance, ratingCount, rupees, shortDate } from './format';

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

  it('gives dates in Pakistan time', () => {
    expect(shortDate('2026-11-09T20:30:00Z')).toBe('10 Nov 2026');
    expect(dateTime('2026-11-09T20:30:00Z')).toBe('10 Nov, 01:30');
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(ago('2026-11-11T11:59:40Z', now)).toBe('just now');
    expect(ago('2026-11-11T11:56:00Z', now)).toBe('4 min ago');
    expect(ago('2026-11-11T10:55:00Z', now)).toBe('1 h 5 min ago');
    expect(ago('2026-11-11T10:00:00Z', now)).toBe('2 h ago');
  });
});
