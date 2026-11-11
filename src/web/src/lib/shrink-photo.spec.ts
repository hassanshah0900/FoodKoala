import { describe, expect, it } from 'vitest';
import { fitSize } from './shrink-photo';

describe('fitSize', () => {
  it('shrinks the longer side to the limit, keeping the shape', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves small photos alone', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
