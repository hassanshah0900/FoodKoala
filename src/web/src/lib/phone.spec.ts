import { formatPhone, normalizeAnyPhone, normalizePhone } from './phone';

describe('phone numbers', () => {
  it.each(['03001234567', '0300 1234567', '300-1234567', '923001234567', '+92 300 1234567', '(0300) 123-4567'])(
    'reads %s',
    (input) => expect(normalizePhone(input)).toBe('+923001234567'),
  );

  it.each(['', '0421234567', '+44 7700 900123', '030012345678', '03001234a67'])('refuses %s', (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );

  it('formats for reading', () => {
    expect(formatPhone('+923001234567')).toBe('+92 300 1234567');
    expect(formatPhone('+922134567890')).toBe('+92 2134567890');
  });

  it.each([
    ['021 3456 7890', '+922134567890'],
    ['0300-1234567', '+923001234567'],
    ['+92 51 2345678', '+92512345678'],
  ])('reads %s as %s for a restaurant', (input, e164) => expect(normalizeAnyPhone(input)).toBe(e164));

  it('refuses what is not a Pakistani number', () => expect(normalizeAnyPhone('12345')).toBeNull());
});
