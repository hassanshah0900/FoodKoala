import type { ZoneInput } from '../zones';
import { del, get, orNull, patch, post, put } from './http';
import type {
  DeliveryQuote,
  DeliveryZone,
  Hours,
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

/** Every restaurant with a status, for choosing one (up to 1,000). */
export async function allWithStatus(token: string, status: RestaurantStatus): Promise<ManagedRestaurant[]> {
  const all: ManagedRestaurant[] = [];
  for (let page = 1; page <= 20; page++) {
    const p = await get<Page<ManagedRestaurant>>('restaurants/admin', { token, query: { status, page, limit: 50 } });
    all.push(...p.items);
    if (!p.hasMore) break;
  }
  return all;
}

/** Any restaurant, in any status, as its owner and admins see it. */
export const managedRestaurant = (token: string, id: string) =>
  orNull(get<ManagedRestaurant>(`restaurants/${id}`, { token }));

export const restaurantZones = (token: string, id: string) => get<DeliveryZone[]>(`restaurants/${id}/zones`, { token });

export const setRestaurantStatus = (token: string, id: string, status: RestaurantStatus, reason?: string) =>
  post<ManagedRestaurant>(`restaurants/${id}/status`, { status, reason }, { token });

// Owners: their own restaurants.

/** Restaurants the caller owns, in any status, newest first. */
export const myRestaurants = (token: string) => get<ManagedRestaurant[]>('restaurants/mine', { token });

/** Stops new orders for a while, e.g. when the kitchen is full. */
export const pauseOrders = (token: string, id: string, minutes: number) =>
  put<ManagedRestaurant>(`restaurants/${id}/pause`, { minutes }, { token });

export const resumeOrders = (token: string, id: string) => del<ManagedRestaurant>(`restaurants/${id}/pause`, { token });

/** Replaces the weekly and special hours. */
export const setHours = (token: string, id: string, hours: Hours) =>
  put<ManagedRestaurant>(`restaurants/${id}/hours`, hours, { token });

// Owners: delivery zones (up to 10). Where zones overlap, customers pay the cheapest.

export const addZone = (token: string, id: string, zone: ZoneInput) =>
  post<DeliveryZone>(`restaurants/${id}/zones`, zone, { token });

export const updateZone = (token: string, id: string, zoneId: string, zone: Partial<ZoneInput>) =>
  patch<DeliveryZone>(`restaurants/${id}/zones/${zoneId}`, zone, { token });

export const deleteZone = (token: string, id: string, zoneId: string) =>
  del<void>(`restaurants/${id}/zones/${zoneId}`, { token });
