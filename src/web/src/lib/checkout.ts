import { isUuid, one, type Params } from './params';

/** Rs 0, 50, 100, 150, 200: the tips offered, as on most delivery apps. */
export const TIPS_PAISA = [0, 5000, 10000, 15000, 20000] as const;

/** The checkout page's choices, kept in its URL so the server can price them. */
export interface CheckoutChoices {
  addressId?: string;
  voucher?: string;
  tipPaisa: number;
  /** A time to schedule the order for (ISO); absent for as soon as possible. */
  at?: string;
}

/** Anything malformed is dropped rather than failing the page. */
export function parseCheckout(params: Params): CheckoutChoices {
  const addressId = one(params.address);
  const voucher = one(params.voucher)?.toUpperCase();
  const tip = Number(one(params.tip));
  const at = one(params.at);
  return {
    addressId: isUuid(addressId) ? addressId : undefined,
    voucher: voucher && /^[A-Z0-9_-]{3,32}$/.test(voucher) ? voucher : undefined,
    tipPaisa: (TIPS_PAISA as readonly number[]).includes(tip) ? tip : 0,
    at: at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : undefined,
  };
}

export function checkoutHref(current: CheckoutChoices, change: Partial<CheckoutChoices>): string {
  const query = checkoutQuery({ ...current, ...change }).toString();
  return query ? `/checkout?${query}` : '/checkout';
}

/** The choices as the checkout URL's query, also the hidden fields of a form that changes one of them. */
export function checkoutQuery(next: CheckoutChoices): URLSearchParams {
  const params = new URLSearchParams();
  if (next.addressId) params.set('address', next.addressId);
  if (next.voucher) params.set('voucher', next.voucher);
  if (next.tipPaisa) params.set('tip', String(next.tipPaisa));
  if (next.at) params.set('at', next.at);
  return params;
}
