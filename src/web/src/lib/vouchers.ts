import { paisaFrom } from './amount';
import type { Voucher, VoucherCreate } from './api/types';
import { rupees } from './format';
import type { Tone } from './review';

/** What a voucher gives, as customers would read it: "20% off, up to Rs 150 · on Rs 500 or more". */
export function voucherTerms(v: Pick<Voucher, 'kind' | 'value' | 'maxDiscountPaisa' | 'minSubtotalPaisa'>): string {
  const off = v.kind === 'percent' ? `${v.value}% off` : `${rupees(v.value)} off`;
  const cap = v.maxDiscountPaisa ? `, up to ${rupees(v.maxDiscountPaisa)}` : '';
  const min = v.minSubtotalPaisa ? ` · on ${rupees(v.minSubtotalPaisa)} or more` : '';
  return `${off}${cap}${min}`;
}

/** Whether customers can use it right now, and if not, why. */
export function voucherState(v: Voucher, now = Date.now()): { label: string; tone: Tone } {
  if (!v.active) return { label: 'Paused', tone: 'bad' };
  if (Date.parse(v.endsAt) <= now) return { label: 'Ended', tone: 'neutral' };
  if (v.usageLimit !== null && v.used >= v.usageLimit) return { label: 'Used up', tone: 'neutral' };
  if (Date.parse(v.startsAt) > now) return { label: 'Scheduled', tone: 'waiting' };
  return { label: 'Live', tone: 'good' };
}

// <input type="datetime-local"> has no time zone; admins mean Pakistan time (UTC+5, no daylight saving).
const PKT_MS = 5 * 3600_000;

/** "2026-11-10T00:00" typed in Pakistan time → RFC 3339 with its offset; null if it isn't a date. */
export function fromPktInput(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  return Number.isNaN(Date.parse(`${local}:00+05:00`)) ? null : `${local}:00+05:00`;
}

/** An instant as a datetime-local value in Pakistan time. */
export const toPktInput = (iso: string) => new Date(Date.parse(iso) + PKT_MS).toISOString().slice(0, 16);

const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : null);

/**
 * The create form's fields as order-service's VoucherCreate, with amounts typed in
 * rupees and times in Pakistan time. Lists what can't be read; order-service
 * checks the rest (percent at most 100, the end after the start, a free code).
 */
export function readVoucherForm(field: (name: string) => string): { voucher: VoucherCreate } | { errors: string[] } {
  const errors: string[] = [];
  const kind = field('kind') === 'flat' ? 'flat' : 'percent';
  const value = kind === 'percent' ? whole(field('value')) : paisaFrom(field('value'));
  if (!value) errors.push(kind === 'percent' ? 'Enter the percent off as a whole number.' : 'Enter the rupees off.');

  const optionalPaisa = (name: string, label: string) => {
    if (!field(name).trim()) return null;
    const p = paisaFrom(field(name));
    if (p === null) errors.push(`${label} must be an amount in rupees.`);
    return p;
  };
  const maxDiscountPaisa = kind === 'percent' ? optionalPaisa('maxDiscount', 'The cap') : null;
  const minSubtotalPaisa = optionalPaisa('minSubtotal', 'The minimum order') ?? 0;

  const usageLimit = field('usageLimit').trim() ? whole(field('usageLimit')) : null;
  if (field('usageLimit').trim() && !usageLimit) errors.push('Total uses must be a whole number.');
  const perCustomerLimit = whole(field('perCustomerLimit')) ?? 0;
  if (perCustomerLimit < 1) errors.push('Uses per customer must be 1 or more.');

  const startsAt = fromPktInput(field('startsAt'));
  const endsAt = fromPktInput(field('endsAt'));
  if (!startsAt || !endsAt) errors.push('Choose when it starts and ends.');

  if (errors.length) return { errors };
  return {
    voucher: {
      code: field('code').trim().toUpperCase(),
      description: field('description').trim(),
      kind,
      value: value!,
      maxDiscountPaisa,
      minSubtotalPaisa,
      restaurantId: field('restaurantId') || null,
      firstOrderOnly: field('firstOrderOnly') === 'on',
      usageLimit,
      perCustomerLimit,
      startsAt: startsAt!,
      endsAt: endsAt!,
    },
  };
}
