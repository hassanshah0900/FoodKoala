import type { Hours } from './api/types';
import { approvalBlockers, restaurantActions, riderActions } from './review';

describe('restaurant review', () => {
  it('offers approve or reject for an application, both ways a reason only for rejecting', () =>
    expect(restaurantActions('pending').map((a) => [a.to, a.needsReason])).toEqual([
      ['approved', false],
      ['rejected', true],
    ]));

  it('suspends a live restaurant with a reason and reinstates it without one', () => {
    expect(restaurantActions('approved')).toEqual([expect.objectContaining({ to: 'suspended', needsReason: true })]);
    expect(restaurantActions('suspended')).toEqual([expect.objectContaining({ to: 'approved', needsReason: false })]);
  });

  const open: Hours = { weekly: { mon: [{ opens: '11:00', closes: '23:00' }] }, special: [] };

  it('lists what stops an approval', () => {
    expect(approvalBlockers(open, 1)).toEqual([]);
    expect(approvalBlockers({ weekly: { mon: [] }, special: [] }, 0)).toEqual(['No opening hours', 'No delivery zone']);
  });

  it('approves a rider, suspends them, and from suspended reinstates or reviews again', () => {
    expect(riderActions('pending').map((a) => a.to)).toEqual(['approved']);
    expect(riderActions('approved').map((a) => a.to)).toEqual(['suspended']);
    expect(riderActions('suspended').map((a) => a.to)).toEqual(['approved', 'pending']);
  });
});
