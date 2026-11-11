import { describe, expect, it } from 'vitest';
import { orderCode, readOrderRef } from './order-code';

describe('orderCode', () => {
  it('is the first 8 hex digits in capitals', () => {
    expect(orderCode('950c29c4-58af-4636-9c70-4fef79efadea')).toBe('950C29C4');
  });
});

describe('readOrderRef', () => {
  it('reads a whole id in lower case', () => {
    expect(readOrderRef(' 950C29C4-58AF-4636-9C70-4FEF79EFADEA ')).toEqual({
      id: '950c29c4-58af-4636-9c70-4fef79efadea',
    });
  });

  it.each(['950c29c4', '#950C29C4', ' #950c29C4 '])('reads %s as a code', (input) => {
    expect(readOrderRef(input)).toEqual({ code: '950C29C4' });
  });

  it.each([undefined, '', '950C29C', 'hello', '950C29C4-58AF'])('rejects %s', (input) => {
    expect(readOrderRef(input)).toBeNull();
  });
});
