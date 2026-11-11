import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

/** A scheduled order is at least this far ahead, so there is time to release it to the kitchen. */
export const MIN_AHEAD_MINUTES = 60;

/** And at most this far: menus and prices are only promised for a week. */
export const MAX_AHEAD_DAYS = 7;

/** The restaurant gets a scheduled order to accept this long before it is due at the door. */
export const KITCHEN_LEAD_MINUTES = 45;

const MINUTE = 60_000;

/** "Sat 15 Nov, 19:30" in Pakistan time, for messages. */
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export const pakistanTime = (at: Date) => clock.format(at).replace(' at ', ', ');

/** 422 for a time too soon or too far ahead; nothing for an order wanted as soon as possible (null). */
export function checkSchedule(scheduledFor: Date | null, now: Date): void {
  if (!scheduledFor) return;
  const ahead = scheduledFor.getTime() - now.getTime();
  if (ahead < MIN_AHEAD_MINUTES * MINUTE) {
    throw new UnprocessableEntityException([
      `Schedule at least ${MIN_AHEAD_MINUTES} minutes ahead, or order for as soon as possible`,
    ]);
  }
  if (ahead > MAX_AHEAD_DAYS * 24 * 60 * MINUTE) {
    throw new UnprocessableEntityException([`Orders can be scheduled up to ${MAX_AHEAD_DAYS} days ahead`]);
  }
}

/** When the restaurant may accept the order: at once, or a kitchen's lead before its scheduled time. */
export const releaseAt = (scheduledFor: Date | null, placedAt: Date) =>
  scheduledFor ? new Date(scheduledFor.getTime() - KITCHEN_LEAD_MINUTES * MINUTE) : placedAt;

/** 409 for accepting a scheduled order before its release: the rider search would start hours early. */
export function assertReleased(order: { releaseAt: Date; scheduledFor: Date | null }, now: Date): void {
  if (!order.scheduledFor || order.releaseAt <= now) return;
  throw new ConflictException(
    `This order is scheduled for ${pakistanTime(order.scheduledFor)}; accept it from ${pakistanTime(order.releaseAt)}`,
  );
}
