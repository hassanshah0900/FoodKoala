import { checkoutHref, parseCheckout } from './checkout';

const id = '0b9c1f9e-4a3f-4a59-9a43-5d1b5f0b7a10';

describe('checkout choices', () => {
  it('reads the URL and drops what is malformed', () => {
    expect(parseCheckout({ address: id, voucher: ' koala20 ', tip: '10000' })).toEqual({
      addressId: id,
      voucher: 'KOALA20',
      tipPaisa: 10000,
    });
    expect(parseCheckout({ address: 'x', voucher: 'a b', tip: '12345' })).toEqual({
      addressId: undefined,
      voucher: undefined,
      tipPaisa: 0,
    });
  });

  it('writes only what is chosen', () => {
    const current = parseCheckout({ address: id, tip: '5000' });
    expect(checkoutHref(current, { voucher: 'KOALA20' })).toBe(`/checkout?address=${id}&voucher=KOALA20&tip=5000`);
    expect(checkoutHref(current, { tipPaisa: 0, addressId: undefined })).toBe('/checkout');
  });
});
