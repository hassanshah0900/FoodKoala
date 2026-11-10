import type { ListingQuery } from '../listing';
import { get } from './http';
import type { CuisineCount, Page, Point, RestaurantResult } from './types';

export const PAGE_SIZE = 24;

/** Restaurants delivering to `at` (search-service). */
export const searchRestaurants = (at: Point, { q, cuisine, sort, page }: ListingQuery) =>
  get<Page<RestaurantResult>>('search/restaurants', {
    query: { lat: at.lat, lng: at.lng, q, cuisine, sort, page, limit: PAGE_SIZE },
  });

/** Cuisines available at `at`, most common first. */
export const cuisinesNear = (at: Point) =>
  get<CuisineCount[]>('search/cuisines', { query: { lat: at.lat, lng: at.lng }, revalidate: 300 });
