import { headline, isFinal, stepsDone } from './order-status';

describe('order status', () => {
  it('counts the steps done', () => {
    expect(stepsDone('placed')).toBe(1);
    expect(stepsDone('picked_up')).toBe(4);
    expect(stepsDone('delivered')).toBe(5);
    expect(stepsDone('cancelled')).toBe(0);
  });

  it('knows when nothing more will happen', () => {
    expect(['delivered', 'rejected', 'cancelled'].every((s) => isFinal(s as never))).toBe(true);
    expect(isFinal('ready')).toBe(false);
  });

  it('names the restaurant while it is its turn', () =>
    expect(headline('accepted', 'Chai Adda')).toBe('Chai Adda is preparing your food'));
});
