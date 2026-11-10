import type { RestaurantRow, Status } from '../db/schema';
import { type Hours, isOpenAt } from '../hours/hours';

/** API shape of Restaurant in the contract (what anyone may see). */
export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  cuisines: string[];
  address: { line1: string; area: string; city: string; province: RestaurantRow['province'] };
  location: { lat: number; lng: number };
  logoUrl: string | null;
  coverUrl: string | null;
  hours: Hours;
  openNow: boolean;
  pausedUntil: Date | null;
  acceptingOrders: boolean;
  rating: Rating;
}

/** Rating in the contract. */
export interface Rating {
  average: number | null;
  count: number;
}

/** Average to one decimal (4.3), null before the first review. */
export function ratingOf(row: Pick<RestaurantRow, 'ratingSum' | 'ratingCount'>): Rating {
  const average = row.ratingCount ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10 : null;
  return { average, count: row.ratingCount };
}

/** API shape of ManagedRestaurant (what the owner and admins see). */
export interface ManagedRestaurant extends Restaurant {
  ownerId: string;
  phone: string;
  status: Status;
  statusReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Open now, not paused and approved: the three things a customer needs before ordering. */
export function availability(
  row: Pick<RestaurantRow, 'status' | 'weeklyHours' | 'specialHours' | 'pausedUntil'>,
  now: Date,
) {
  const openNow = isOpenAt({ weekly: row.weeklyHours, special: row.specialHours }, now);
  const pausedUntil = row.pausedUntil && row.pausedUntil > now ? row.pausedUntil : null;
  return { openNow, pausedUntil, acceptingOrders: row.status === 'approved' && openNow && !pausedUntil };
}

export function toRestaurant(row: RestaurantRow, now = new Date()): Restaurant {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cuisines: row.cuisines,
    address: { line1: row.line1, area: row.area, city: row.city, province: row.province },
    location: { lat: row.lat, lng: row.lng },
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    hours: { weekly: row.weeklyHours, special: row.specialHours },
    ...availability(row, now),
    rating: ratingOf(row),
  };
}

export function toManagedRestaurant(row: RestaurantRow, now = new Date()): ManagedRestaurant {
  return {
    ...toRestaurant(row, now),
    ownerId: row.ownerId,
    phone: row.phone,
    status: row.status,
    statusReason: row.statusReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
