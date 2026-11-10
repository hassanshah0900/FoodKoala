import type { OrderStatus } from './api/types';

/** The steps an order goes through, in order, as the tracker shows them. */
export const STEPS = [
  { status: 'placed', label: 'Order placed' },
  { status: 'accepted', label: 'Being prepared' },
  { status: 'ready', label: 'Ready for pickup' },
  { status: 'picked_up', label: 'On its way' },
  { status: 'delivered', label: 'Delivered' },
] as const satisfies readonly { status: OrderStatus; label: string }[];

export const isFinal = (s: OrderStatus) => s === 'delivered' || s === 'rejected' || s === 'cancelled';

/** The headline for where the order is now. */
export function headline(status: OrderStatus, restaurant: string): string {
  switch (status) {
    case 'placed':
      return `Waiting for ${restaurant} to accept your order`;
    case 'accepted':
      return `${restaurant} is preparing your food`;
    case 'ready':
      return 'Your food is ready and waiting for the rider';
    case 'picked_up':
      return 'Your rider is on the way';
    case 'delivered':
      return 'Delivered. Enjoy your meal!';
    case 'rejected':
      return `${restaurant} couldn't take your order`;
    case 'cancelled':
      return 'This order was cancelled';
  }
}

/** How many tracker steps are done (the current one included); 0 for an order that stopped. */
export function stepsDone(status: OrderStatus): number {
  const i = STEPS.findIndex((s) => s.status === status);
  return i === -1 ? 0 : i + 1;
}
