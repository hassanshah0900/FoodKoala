import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Actor, Status } from '../db/schema';

interface Rule {
  /** Who may make the change, in the order we record them when the caller is several. */
  by: readonly Actor[];
  /** Actors who must say why. */
  reasonFrom?: readonly Actor[];
}

/** The life cycle table of contracts/openapi/order-service.yaml. */
export const TRANSITIONS: Readonly<Partial<Record<`${Status}>${Status}`, Rule>>> = {
  'placed>accepted': { by: ['restaurant'] },
  // `system`: nobody at the restaurant answered in time (AcceptTimeouts).
  'placed>rejected': { by: ['restaurant', 'admin', 'system'], reasonFrom: ['restaurant', 'admin'] },
  'placed>cancelled': { by: ['customer', 'admin'], reasonFrom: ['admin'] },
  'accepted>ready': { by: ['restaurant'] },
  'accepted>cancelled': { by: ['admin'], reasonFrom: ['admin'] },
  'ready>cancelled': { by: ['admin'], reasonFrom: ['admin'] },
  // The rider's pickups and drop-offs arrive as delivery events; an admin can still record them by hand.
  // A rider may pick up an order the restaurant forgot to mark ready.
  'accepted>picked_up': { by: ['rider'] },
  'ready>picked_up': { by: ['rider', 'admin'] },
  'picked_up>delivered': { by: ['rider', 'admin'] },
};

export const FINAL: readonly Status[] = ['delivered', 'rejected', 'cancelled'];

export const LABEL: Record<Status, string> = {
  placed: 'placed',
  accepted: 'accepted',
  ready: 'ready',
  picked_up: 'picked up',
  delivered: 'delivered',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

const VERB: Partial<Record<Status, string>> = {
  accepted: 'accept',
  rejected: 'reject',
  cancelled: 'cancel',
  ready: 'mark ready',
  picked_up: 'mark picked up',
  delivered: 'mark delivered',
};

export const ruleFor = (from: Status, to: Status): Rule | undefined => TRANSITIONS[`${from}>${to}`];

/** Whether we must ask restaurant-service if the caller owns the restaurant to decide. */
export function needsOwnership(from: Status, to: Status, known: ReadonlySet<Actor>): boolean {
  if (known.size === 0) return true; // to tell 404 (not theirs to see) from 403
  const rule = ruleFor(from, to);
  return !!rule && rule.by.includes('restaurant') && !rule.by.some((a) => known.has(a));
}

export interface Change {
  to: Status;
  reason?: string;
  prepTimeMinutes?: number;
}

/**
 * Who makes the change, given every role the caller has towards the order.
 * 404 when they have none (they can't see it), 409 for a change the status
 * doesn't allow, 403 when someone else must make it, 400 for missing details.
 */
export function decide(from: Status, change: Change, roles: ReadonlySet<Actor>): Actor {
  if (roles.size === 0) throw new NotFoundException('Order not found');
  const rule = ruleFor(from, change.to);
  if (!rule) {
    throw new ConflictException(
      FINAL.includes(from)
        ? `The order is already ${LABEL[from]}`
        : `A ${LABEL[from]} order cannot become ${LABEL[change.to]}`,
    );
  }
  const actor = rule.by.find((a) => roles.has(a));
  if (!actor) {
    const names: Partial<Record<Actor, string>> = {
      customer: 'the customer',
      admin: 'an admin',
      restaurant: 'the restaurant',
      rider: 'the rider',
    };
    const who = rule.by.flatMap((a) => names[a] ?? []); // nobody calls the API as `system`
    throw new ForbiddenException(`Only ${who.join(' or ')} can ${VERB[change.to]} this order`);
  }
  if (rule.reasonFrom?.includes(actor) && !change.reason) {
    throw new BadRequestException(`Give a reason to ${VERB[change.to]} the order`);
  }
  if (change.to === 'accepted' && change.prepTimeMinutes === undefined) {
    throw new BadRequestException('Say how many minutes the food needs (prepTimeMinutes) to accept the order');
  }
  if (change.to !== 'accepted' && change.prepTimeMinutes !== undefined) {
    throw new BadRequestException('prepTimeMinutes is only for accepting an order');
  }
  return actor;
}

/**
 * When the food should arrive after the restaurant accepts: the time promised
 * at checkout, or later if the kitchen needs longer than that allowed.
 */
export function estimateOnAccept(promised: Date, now: Date, prepTimeMinutes: number, rideMinutes: number): Date {
  const ready = now.getTime() + (prepTimeMinutes + rideMinutes) * 60_000;
  return new Date(Math.max(promised.getTime(), ready));
}
