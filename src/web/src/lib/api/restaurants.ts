import { get, orNull, post } from './http';
import type {
  DeliveryQuote,
  DeliveryZone,
  ManagedRestaurant,
  Page,
  Point,
  Restaurant,
  RestaurantStatus,
  Review,
} from './types';

/** The restaurant, or null if there is no such approved restaurant. */
export const getRestaurant = (id: string) => orNull(get<Restaurant>(`restaurants/${id}`, { revalidate: 60 }));

/** Whether it delivers to `at`, and on what terms. */
export const deliveryQuote = (id: string, at: Point) =>
  orNull(get<DeliveryQuote>(`restaurants/${id}/delivery-quote`, { query: { lat: at.lat, lng: at.lng } }));

export const latestReviews = (id: string, limit = 3) =>
  get<Page<Review>>(`restaurants/${id}/reviews`, { query: { limit }, revalidate: 300 });

// Admin: reviewing applications and managing any restaurant.

/** Restaurants with a status, oldest first, so applications are reviewed in order. */
export const restaurantsWithStatus = (token: string, status: RestaurantStatus, page = 1) =>
  get<Page<ManagedRestaurant>>('restaurants/admin', { token, query: { status, page } });

/** Any restaurant, in any status, as its owner and admins see it. */
export const managedRestaurant = (token: string, id: string) =>
  orNull(get<ManagedRestaurant>(`restaurants/${id}`, { token }));

export const restaurantZones = (token: string, id: string) => get<DeliveryZone[]>(`restaurants/${id}/zones`, { token });

export const setRestaurantStatus = (token: string, id: string, status: RestaurantStatus, reason?: string) =>
  post<ManagedRestaurant>(`restaurants/${id}/status`, { status, reason }, { token });
