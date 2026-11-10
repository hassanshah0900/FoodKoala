import type { Hours, RestaurantStatus, RiderStatus } from './api/types';

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
