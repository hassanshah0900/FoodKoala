import { UnprocessableEntityException } from '@nestjs/common';
import type { VoucherRow } from '../db/schema';
import { rupees } from '../money';

/** How much a voucher has been used, counting only orders that stand (not rejected or cancelled). */
export interface VoucherUse {
  total: number;
  byCustomer: number;
  /** The customer has an order that stands, so this one is not their first. */
  customerHasOrdered: boolean;
}

export type VoucherTerms = Pick<
  VoucherRow,
  | 'kind'
  | 'value'
  | 'maxDiscountPaisa'
  | 'minSubtotalPaisa'
  | 'restaurantId'
  | 'firstOrderOnly'
  | 'usageLimit'
  | 'perCustomerLimit'
  | 'startsAt'
  | 'endsAt'
  | 'active'
>;

/** Codes are matched without regard to case or surrounding spaces. */
export const normaliseCode = (code: string) => code.trim().toUpperCase();

/**
 * The paisa a voucher takes off this order's subtotal, or 422 with the
 * reason it can't be used. Never more than the subtotal.
 */
export function discountFor(
  voucher: VoucherTerms,
  order: { restaurantId: string; subtotalPaisa: number; now: Date },
  use: VoucherUse,
): number {
  const fail = (reason: string): never => {
    throw new UnprocessableEntityException([reason]);
  };
  if (!voucher.active || order.now >= voucher.endsAt) fail('This voucher has expired');
  if (order.now < voucher.startsAt) fail('This voucher is not valid yet');
  if (voucher.restaurantId !== null && voucher.restaurantId !== order.restaurantId)
    fail('This voucher is not valid at this restaurant');
  if (voucher.firstOrderOnly && use.customerHasOrdered) fail('This voucher is for your first order only');
  if (use.byCustomer >= voucher.perCustomerLimit)
    fail(
      voucher.perCustomerLimit === 1
        ? 'You have already used this voucher'
        : `You have already used this voucher ${voucher.perCustomerLimit} times`,
    );
  if (voucher.usageLimit !== null && use.total >= voucher.usageLimit) fail('This voucher has been fully used');
  if (order.subtotalPaisa < voucher.minSubtotalPaisa)
    fail(
      `This voucher needs a subtotal of ${rupees(voucher.minSubtotalPaisa)}; add ${rupees(voucher.minSubtotalPaisa - order.subtotalPaisa)} more`,
    );

  const off =
    voucher.kind === 'percent'
      ? Math.min(
          Math.floor((order.subtotalPaisa * voucher.value) / 100),
          voucher.maxDiscountPaisa ?? Number.POSITIVE_INFINITY,
        )
      : voucher.value;
  return Math.min(off, order.subtotalPaisa);
}
