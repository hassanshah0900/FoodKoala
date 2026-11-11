import { codeRange, orderCode } from './order-code';

describe('orderCode', () => {
  it('is the first 8 hex digits in capitals', () => {
    expect(orderCode('950c29c4-58af-4636-9c70-4fef79efadea')).toBe('950C29C4');
  });
});

describe('codeRange', () => {
  it('spans every id that starts with the code', () => {
    const [low, high] = codeRange('950c29c4');
    expect(low).toBe('950c29c4-0000-0000-0000-000000000000');
    expect(high).toBe('950c29c4-ffff-ffff-ffff-ffffffffffff');
    const id = '950c29c4-58af-4636-9c70-4fef79efadea';
    expect(id >= low && id <= high).toBe(true);
  });
});
