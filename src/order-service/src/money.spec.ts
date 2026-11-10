import { rupees } from './money';

describe('rupees', () => {
  it.each([
    [50000, 'Rs 500'],
    [49950, 'Rs 499.50'],
    [5, 'Rs 0.05'],
  ])('%i paisa reads as %s', (paisa, text) => expect(rupees(paisa)).toBe(text));
});
