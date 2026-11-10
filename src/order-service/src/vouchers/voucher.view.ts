import type { VoucherRow } from '../db/schema';

/** Voucher in contracts/openapi/order-service.yaml. */
export type Voucher = Omit<VoucherRow, 'updatedAt'> & {
  /** Orders that carry it and stand, i.e. not rejected or cancelled. */
  used: number;
};

/** VoucherDiscount in contracts/openapi/order-service.yaml: what a code takes off the cart. */
export interface VoucherDiscount {
  code: string;
  description: string;
  discountPaisa: number;
}

export const toVoucher = ({ updatedAt: _updatedAt, ...voucher }: VoucherRow, used: number): Voucher => ({
  ...voucher,
  used,
});
