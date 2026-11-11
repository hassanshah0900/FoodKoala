import { clockTime } from './format';

// Scheduling an order ahead. The limits are order-service's (src/orders/schedule.ts), which checks them again.

/** The earliest a scheduled order can be for. */
export const MIN_AHEAD_MINUTES = 60;

/** The latest. */
export const MAX_AHEAD_DAYS = 7;

/** Times offered, on the half hour. */
export const SLOT_STEP_MINUTES = 30;

/**
 * The range to ask the restaurant's open slots for. The first slot is a few minutes past the minimum,
 * so it is still far enough ahead while the customer finishes checking out.
 */
export function slotWindow(now: number): { from: Date; to: Date } {
  return {
    from: new Date(now + (MIN_AHEAD_MINUTES + 5) * 60_000),
    to: new Date(now + MAX_AHEAD_DAYS * 86_400_000 - 5 * 60_000),
  };
}

const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

/** "Today", "Tomorrow" or "Sat 15 Nov", in Pakistan time. */
export function dayName(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (dayKey(t) === dayKey(now)) return 'Today';
  if (dayKey(t) === dayKey(now + 86_400_000)) return 'Tomorrow';
  return new Date(t).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Karachi',
  });
}

/** "Today, 19:30" or "Sat 15 Nov, 13:00". */
export const whenLabel = (iso: string, now: number) => `${dayName(iso, now)}, ${clockTime(iso)}`;

/** The open slots by day, in order, for a picker with a group per day. */
export function slotsByDay(slots: string[], now: number): { day: string; slots: { iso: string; time: string }[] }[] {
  const days: { day: string; slots: { iso: string; time: string }[] }[] = [];
  for (const iso of slots) {
    const day = dayName(iso, now);
    if (days.at(-1)?.day !== day) days.push({ day, slots: [] });
    days.at(-1)!.slots.push({ iso, time: clockTime(iso) });
  }
  return days;
}
