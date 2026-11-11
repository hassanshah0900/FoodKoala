/**
 * The short code people read out: the first 8 hex digits of the order id, upper case ("950C29C4").
 * Customers see it on their order, restaurants on the ticket, riders on the delivery.
 */
export const orderCode = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * The ids a code can stand for, as an inclusive range of UUIDs: UUIDs compare in hex order, so the
 * primary key index finds them without scanning. `code` is 8 lower-case hex digits.
 */
export const codeRange = (code: string): [string, string] => [
  `${code}-0000-0000-0000-000000000000`,
  `${code}-ffff-ffff-ffff-ffffffffffff`,
];
