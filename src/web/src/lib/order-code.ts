import { isUuid } from './params';

/** The short code people read out: the first 8 hex digits of the order id in capitals ("950C29C4"). */
export const orderCode = (id: string) => id.slice(0, 8).toUpperCase();

/** What an admin typed to find an order: a whole id, a short code (with or without #), or neither. */
export type OrderRef = { id: string } | { code: string } | null;

export function readOrderRef(input: string | undefined): OrderRef {
  const text = (input ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(text)) return { code: text.toUpperCase() };
  return isUuid(text) ? { id: text.toLowerCase() } : null;
}
