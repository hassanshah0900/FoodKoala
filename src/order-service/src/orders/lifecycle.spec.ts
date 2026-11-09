import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Actor } from '../db/schema';
import { decide, estimateOnAccept, needsOwnership } from './lifecycle';

const as = (...roles: Actor[]) => new Set(roles);

describe('decide', () => {
  it('lets the restaurant accept a placed order with a prep time', () => {
    expect(decide('placed', { to: 'accepted', prepTimeMinutes: 20 }, as('restaurant'))).toBe('restaurant');
  });

  it('needs a prep time to accept, and only then', () => {
    expect(() => decide('placed', { to: 'accepted' }, as('restaurant'))).toThrow(BadRequestException);
    expect(() => decide('accepted', { to: 'ready', prepTimeMinutes: 10 }, as('restaurant'))).toThrow(/only for accepting/);
  });

  it('lets the customer cancel before the restaurant accepts, without a reason', () => {
    expect(decide('placed', { to: 'cancelled' }, as('customer'))).toBe('customer');
  });

  it('does not let the customer cancel once accepted', () => {
    expect(() => decide('accepted', { to: 'cancelled' }, as('customer'))).toThrow(
      new ForbiddenException('Only an admin can cancel this order'),
    );
  });

  it('needs a reason to reject, and from an admin to cancel', () => {
    expect(() => decide('placed', { to: 'rejected' }, as('restaurant'))).toThrow(new BadRequestException('Give a reason to reject the order'));
    expect(() => decide('ready', { to: 'cancelled' }, as('admin'))).toThrow(BadRequestException);
    expect(decide('ready', { to: 'cancelled', reason: 'Rider had an accident' }, as('admin'))).toBe('admin');
  });

  it('records an owner who is also an admin as the restaurant', () => {
    expect(decide('placed', { to: 'rejected', reason: 'Out of chicken' }, as('admin', 'restaurant'))).toBe('restaurant');
  });

  it('records a customer who is also an admin as the customer when cancelling their own order', () => {
    expect(decide('placed', { to: 'cancelled' }, as('customer', 'admin'))).toBe('customer');
  });

  it('keeps the customer from accepting their own order', () => {
    expect(() => decide('placed', { to: 'accepted', prepTimeMinutes: 10 }, as('customer'))).toThrow(
      new ForbiddenException('Only the restaurant can accept this order'),
    );
  });

  it('hides the order from someone with no part in it', () => {
    expect(() => decide('placed', { to: 'cancelled' }, as())).toThrow(NotFoundException);
  });

  it('refuses skipping steps and leaving a final status', () => {
    expect(() => decide('placed', { to: 'delivered' }, as('admin'))).toThrow(new ConflictException('A placed order cannot become delivered'));
    expect(() => decide('delivered', { to: 'cancelled', reason: 'x' }, as('admin'))).toThrow(new ConflictException('The order is already delivered'));
    expect(() => decide('picked_up', { to: 'ready' }, as('admin'))).toThrow(/picked up order cannot become ready/);
  });

  it('lets the rider pick up, even before the restaurant marked the food ready, and deliver', () => {
    expect(decide('accepted', { to: 'picked_up' }, as('rider'))).toBe('rider');
    expect(decide('ready', { to: 'picked_up' }, as('rider'))).toBe('rider');
    expect(decide('picked_up', { to: 'delivered' }, as('rider'))).toBe('rider');
    expect(() => decide('accepted', { to: 'picked_up' }, as('admin'))).toThrow(
      new ForbiddenException('Only the rider can mark picked up this order'),
    );
  });

  it('lets the system reject an unanswered order without naming it to callers', () => {
    expect(decide('placed', { to: 'rejected', reason: 'Not accepted within 10 minutes' }, as('system'))).toBe('system');
    expect(() => decide('placed', { to: 'rejected', reason: 'x' }, as('customer'))).toThrow(
      new ForbiddenException('Only the restaurant or an admin can reject this order'),
    );
  });

  it('walks the happy path', () => {
    expect(decide('accepted', { to: 'ready' }, as('restaurant'))).toBe('restaurant');
    expect(decide('ready', { to: 'picked_up' }, as('admin'))).toBe('admin');
    expect(decide('picked_up', { to: 'delivered' }, as('admin'))).toBe('admin');
  });
});

describe('needsOwnership', () => {
  it('asks when the caller has no other part in the order', () => {
    expect(needsOwnership('placed', 'cancelled', as())).toBe(true);
  });

  it("doesn't ask when the customer or an admin may already make the change", () => {
    expect(needsOwnership('placed', 'cancelled', as('customer'))).toBe(false);
    expect(needsOwnership('placed', 'rejected', as('admin'))).toBe(false);
  });

  it('asks when only the restaurant may make the change', () => {
    expect(needsOwnership('placed', 'accepted', as('admin'))).toBe(true);
  });

  it("doesn't ask when the restaurant couldn't make the change anyway", () => {
    expect(needsOwnership('ready', 'picked_up', as('customer'))).toBe(false);
  });
});

describe('estimateOnAccept', () => {
  const placed = new Date('2026-11-08T10:00:00Z');
  const promised = new Date('2026-11-08T10:40:00Z');

  it('keeps the promised time when the kitchen is quick enough', () => {
    expect(estimateOnAccept(promised, new Date('2026-11-08T10:02:00Z'), 15, 15)).toEqual(promised);
  });

  it('pushes the time when the kitchen needs longer', () => {
    expect(estimateOnAccept(promised, new Date(placed.getTime() + 5 * 60_000), 45, 15)).toEqual(new Date('2026-11-08T11:05:00Z'));
  });
});
