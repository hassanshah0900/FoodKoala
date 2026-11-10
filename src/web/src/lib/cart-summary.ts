import type { Cart, Delivery } from './api/types';

export interface CartSummary {
  items: number;
  subtotalPaisa: number;
  /** Null when the restaurant doesn't deliver to the chosen area (or none is chosen). */
  deliveryFeePaisa: number | null;
  totalPaisa: number;
  /** How much more food is needed to reach the restaurant's minimum order; 0 once reached. */
  shortOfMinimumPaisa: number;
}

/** What the cart panel shows under the lines. Tax is included in menu prices. */
export function summarize(cart: Pick<Cart, 'lines' | 'subtotalPaisa'>, delivery: Delivery | null): CartSummary {
  const fee = delivery?.deliveryFeePaisa ?? null;
  return {
    items: cart.lines.reduce((n, l) => n + l.quantity, 0),
    subtotalPaisa: cart.subtotalPaisa,
    deliveryFeePaisa: fee,
    totalPaisa: cart.subtotalPaisa + (fee ?? 0),
    shortOfMinimumPaisa: Math.max(0, (delivery?.minimumOrderPaisa ?? 0) - cart.subtotalPaisa),
  };
}
