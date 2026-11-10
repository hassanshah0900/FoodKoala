import type { DeliveryStatus, Hours, OrderStatus, PaymentStatus, RestaurantStatus, RiderStatus } from './api/types';

/** A status change an admin can make from here. */
export interface StatusAction<S extends string> {
  to: S;
  label: string;
  /** The owner is told why, so rejecting or suspending needs a reason. */
  needsReason: boolean;
  tone: 'primary' | 'danger' | 'plain';
}

/** The admin's moves in restaurant-service's life cycle (POST /restaurants/{id}/status). */
const RESTAURANT_ACTIONS: Record<RestaurantStatus, StatusAction<RestaurantStatus>[]> = {
  pending: [
    { to: 'approved', label: 'Approve', needsReason: false, tone: 'primary' },
    { to: 'rejected', label: 'Reject', needsReason: true, tone: 'danger' },
  ],
  approved: [{ to: 'suspended', label: 'Suspend', needsReason: true, tone: 'danger' }],
  suspended: [{ to: 'approved', label: 'Reinstate', needsReason: false, tone: 'primary' }],
  rejected: [{ to: 'pending', label: 'Return to review', needsReason: false, tone: 'plain' }],
};

export const restaurantActions = (status: RestaurantStatus) => RESTAURANT_ACTIONS[status];

/** How a status badge reads: waiting for an admin, fine, stopped, or nothing to do. */
export type Tone = 'waiting' | 'good' | 'bad' | 'neutral';

export interface StatusLabel<S extends string> {
  status: S;
  label: string;
  tone: Tone;
}

export const RESTAURANT_STATUSES: readonly StatusLabel<RestaurantStatus>[] = [
  { status: 'pending', label: 'Waiting for review', tone: 'waiting' },
  { status: 'approved', label: 'Live', tone: 'good' },
  { status: 'suspended', label: 'Suspended', tone: 'bad' },
  { status: 'rejected', label: 'Rejected', tone: 'neutral' },
];

/** A status's label and tone, from a list like RESTAURANT_STATUSES. */
export const labelOf = <S extends string>(statuses: readonly StatusLabel<S>[], status: S) =>
  statuses.find((s) => s.status === status)!;

/** What restaurant-service will refuse an approval for, so the admin sees it before trying. */
export function approvalBlockers(hours: Hours, zoneCount: number): string[] {
  const blockers: string[] = [];
  if (!Object.values(hours.weekly).some((ranges) => ranges && ranges.length > 0)) blockers.push('No opening hours');
  if (zoneCount === 0) blockers.push('No delivery zone');
  return blockers;
}

/** The admin's moves for a rider (POST /riders/{userId}/status); a rider isn't told a reason. */
const RIDER_ACTIONS: Record<RiderStatus, StatusAction<RiderStatus>[]> = {
  pending: [{ to: 'approved', label: 'Approve', needsReason: false, tone: 'primary' }],
  approved: [{ to: 'suspended', label: 'Suspend', needsReason: false, tone: 'danger' }],
  suspended: [
    { to: 'approved', label: 'Reinstate', needsReason: false, tone: 'primary' },
    { to: 'pending', label: 'Back to review', needsReason: false, tone: 'plain' },
  ],
};

export const riderActions = (status: RiderStatus) => RIDER_ACTIONS[status];

export const RIDER_STATUSES: readonly StatusLabel<RiderStatus>[] = [
  { status: 'pending', label: 'Waiting for approval', tone: 'waiting' },
  { status: 'approved', label: 'Approved', tone: 'good' },
  { status: 'suspended', label: 'Suspended', tone: 'bad' },
];

const cancel: StatusAction<OrderStatus> = { to: 'cancelled', label: 'Cancel order', needsReason: true, tone: 'danger' };

/**
 * What an admin can do to an order (order-service's life cycle): stop it with a
 * reason, or step in for a rider who can't mark the pickup or drop-off.
 */
const ORDER_ACTIONS: Record<OrderStatus, StatusAction<OrderStatus>[]> = {
  placed: [{ to: 'rejected', label: 'Reject for the restaurant', needsReason: true, tone: 'danger' }, cancel],
  accepted: [cancel],
  ready: [{ to: 'picked_up', label: 'Mark picked up', needsReason: false, tone: 'plain' }, cancel],
  picked_up: [{ to: 'delivered', label: 'Mark delivered', needsReason: false, tone: 'primary' }],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export const orderActions = (status: OrderStatus) => ORDER_ACTIONS[status];

export const ORDER_STATUSES: readonly StatusLabel<OrderStatus>[] = [
  { status: 'placed', label: 'Waiting for the restaurant', tone: 'waiting' },
  { status: 'accepted', label: 'Being prepared', tone: 'good' },
  { status: 'ready', label: 'Ready for pickup', tone: 'good' },
  { status: 'picked_up', label: 'On its way', tone: 'good' },
  { status: 'delivered', label: 'Delivered', tone: 'neutral' },
  { status: 'rejected', label: 'Rejected', tone: 'bad' },
  { status: 'cancelled', label: 'Cancelled', tone: 'bad' },
];

/** Each step of an order's timeline as an event: "Placed by customer", "Picked up by rider". */
export const ORDER_EVENTS: Record<OrderStatus, string> = {
  placed: 'Placed',
  accepted: 'Accepted',
  ready: 'Ready',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const DELIVERY_STATUSES: readonly StatusLabel<DeliveryStatus>[] = [
  { status: 'searching', label: 'Looking for a rider', tone: 'waiting' },
  { status: 'waiting', label: 'Restaurant to accept', tone: 'neutral' },
  { status: 'assigned', label: 'Rider on the way', tone: 'good' },
  { status: 'picked_up', label: 'Picked up', tone: 'good' },
  { status: 'delivered', label: 'Delivered', tone: 'neutral' },
  { status: 'cancelled', label: 'Cancelled', tone: 'bad' },
];

export const PAYMENT_STATUSES: readonly StatusLabel<PaymentStatus>[] = [
  { status: 'pending', label: 'To collect', tone: 'waiting' },
  { status: 'collected', label: 'Collected', tone: 'good' },
  { status: 'cancelled', label: 'Cancelled', tone: 'neutral' },
];
