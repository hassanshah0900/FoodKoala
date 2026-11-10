import { get, orNull } from './http';
import type { Menu } from './types';

/** The menu in display order, or null if the restaurant has none. */
export const getMenu = (restaurantId: string) => orNull(get<Menu>(`menus/restaurants/${restaurantId}`, {}, 60));
