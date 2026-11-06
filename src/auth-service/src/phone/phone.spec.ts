import { normalizePakistaniMobile } from './phone';

describe('normalizePakistaniMobile', () => {
  it.each([
    '03001234567',
    '3001234567',
    '923001234567',
    '+923001234567',
    '00923001234567',
    '+92 300 1234567',
    '0300-1234567',
    ' (0300) 123 4567 ',
  ])('normalises %j to E.164', (input) => {
    expect(normalizePakistaniMobile(input)).toBe('+923001234567');
  });

  it.each([
    '',
    '0300123456', // too short
    '030012345678', // too long
    '04235761234', // Lahore landline
    '+913001234567', // India
    '0300123456a',
  ])('rejects %j', (input) => {
    expect(normalizePakistaniMobile(input)).toBeNull();
  });
});
