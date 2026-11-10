import type { Cart, Delivery } from './api/types';

export interface CartSummary {
  items: number;
  subtotalPaisa: number;
  /** Null when the restaurant doesn't deliver to the chosen place (or none is chosen). */
  deliveryFeePaisa: number | null;
  discountPaisa: number;
  tipPaisa: number;
  totalPaisa: number;
  /** How much more food is needed to reach the restaurant's minimum order; 0 once reached. */
  shortOfMinimumPaisa: number;
}

/**
 * What the customer pays, as order-service will charge it: subtotal + delivery
 * fee − voucher discount + tip. Tax is included in menu prices.
 */
export function summarize(
  cart: Pick<Cart, 'lines' | 'subtotalPaisa'>,
  delivery: Delivery | null,
  extras: { discountPaisa?: number; tipPaisa?: number } = {},
): CartSummary {
  const fee = delivery?.deliveryFeePaisa ?? null;
  const discount = Math.min(extras.discountPaisa ?? 0, cart.subtotalPaisa);
  const tip = extras.tipPaisa ?? 0;
  return {
    items: cart.lines.reduce((n, l) => n + l.quantity, 0),
    subtotalPaisa: cart.subtotalPaisa,
    deliveryFeePaisa: fee,
    discountPaisa: discount,
    tipPaisa: tip,
    totalPaisa: cart.subtotalPaisa + (fee ?? 0) - discount + tip,
    shortOfMinimumPaisa: Math.max(0, (delivery?.minimumOrderPaisa ?? 0) - cart.subtotalPaisa),
  };
}
