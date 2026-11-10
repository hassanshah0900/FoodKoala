const PKT = 'Asia/Karachi';

/** Rs 500, or Rs 499.50: money as customers read it (paisa in, rupees out). */
export function rupees(paisa: number): string {
  const whole = paisa % 100 === 0;
  const amount = (paisa / 100).toLocaleString('en-PK', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `Rs ${amount}`;
}

/** The delivery time as a range, since the zone's figure is a typical time: 30 → "30–40 min". */
export const deliveryWindow = (minutes: number) => `${minutes}–${minutes + 10} min`;

/** 850 m, or 2.4 km. */
export function distance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** How many ratings, rounded down the way listings show them: 37, 100+, 1,000+. */
export function ratingCount(count: number): string {
  if (count < 100) return String(count);
  const steps = [10_000, 5_000, 1_000, 500, 100];
  const step = steps.find((s) => count >= s)!;
  return `${(Math.floor(count / step) * step).toLocaleString('en-PK')}+`;
}

/** "13:30" in Pakistan time, for "Opens at" and "Paused until". */
export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: PKT,
  });

/** "10 Nov 2026" in Pakistan time. */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: PKT });

/** "10 Nov, 13:30" in Pakistan time. */
export const dateTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: PKT })}, ${clockTime(iso)}`;

/** How long ago, for a kitchen's tickets: "just now", "4 min ago", "1 h 5 min ago". */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''} ago`;
}
