import { formatPhone, normalizePhone } from './phone';

describe('phone numbers', () => {
  it.each(['03001234567', '0300 1234567', '300-1234567', '923001234567', '+92 300 1234567', '(0300) 123-4567'])(
    'reads %s',
    (input) => expect(normalizePhone(input)).toBe('+923001234567'),
  );

  it.each(['', '0421234567', '+44 7700 900123', '030012345678', '03001234a67'])('refuses %s', (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );

  it('formats for reading', () => expect(formatPhone('+923001234567')).toBe('+92 300 1234567'));
});
