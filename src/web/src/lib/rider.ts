import type { OrderDelivery, Point, Rider } from './api/types';

export const VEHICLES: { value: Rider['vehicle']; label: string }[] = [
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
];

/** Directions in the phone's maps app (Google Maps' universal link opens the app when it is installed). */
export const directions = (to: Point) => `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;

/** What the rider does next with a delivery, and where they are heading. */
export function nextStep(
  d: Pick<OrderDelivery, 'status' | 'foodReadyAt'>,
):
  | { step: 'pickup'; label: string; heading: 'restaurant'; note: string }
  | { step: 'dropoff'; label: string; heading: 'customer'; note: string }
  | null {
  if (d.status === 'assigned')
    return {
      step: 'pickup',
      label: 'I have the food',
      heading: 'restaurant',
      note: d.foodReadyAt ? 'The food is ready.' : 'The kitchen is still preparing it.',
    };
  if (d.status === 'picked_up')
    return { step: 'dropoff', label: 'Delivered', heading: 'customer', note: 'Hand it over and collect any cash.' };
  return null;
}

/** How often an online rider's phone sends its position; delivery-service treats one older than 5 minutes as stale. */
export const LOCATION_EVERY_MS = 20_000;
