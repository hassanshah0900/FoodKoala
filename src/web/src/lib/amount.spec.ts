import { paisaFrom, rupeesField } from './amount';

describe('amounts typed in rupees', () => {
  it.each([
    ['1172', 117200],
    ['1,172.50', 117250],
    ['Rs 500', 50000],
    ['rs. 0.5', 50],
  ])('%s is %i paisa', (text, paisa) => expect(paisaFrom(text)).toBe(paisa));

  it.each(['', 'abc', '-5', '1.234', '1e3'])('refuses %j', (text) => expect(paisaFrom(text)).toBeNull());

  it('fills a field back', () => {
    expect(rupeesField(117250)).toBe('1172.50');
    expect(rupeesField(50000)).toBe('500');
  });
});
