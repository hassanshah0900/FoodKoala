import { get, orNull } from './http';
import type { DeliveryQuote, Page, Point, Restaurant, Review } from './types';

/** The restaurant, or null if there is no such approved restaurant. */
export const getRestaurant = (id: string) => orNull(get<Restaurant>(`restaurants/${id}`, { revalidate: 60 }));

/** Whether it delivers to `at`, and on what terms. */
export const deliveryQuote = (id: string, at: Point) =>
  orNull(get<DeliveryQuote>(`restaurants/${id}/delivery-quote`, { query: { lat: at.lat, lng: at.lng } }));

export const latestReviews = (id: string, limit = 3) =>
  get<Page<Review>>(`restaurants/${id}/reviews`, { query: { limit }, revalidate: 300 });
