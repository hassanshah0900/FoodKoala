import { del, get, orNull, patch, post, put } from './http';
import type { Menu, MenuCategory, MenuItem } from './types';

/** The menu in display order, or null if the restaurant has none. */
export const getMenu = (restaurantId: string) =>
  orNull(get<Menu>(`menus/restaurants/${restaurantId}`, { revalidate: 60 }));

// Owners (or admins) editing a menu. menu-service checks with restaurant-service who owns it.

/** The menu as it is now, not the minute-old copy customers are shown. */
export const freshMenu = (token: string, restaurantId: string) =>
  get<Menu>(`menus/restaurants/${restaurantId}`, { token });

export interface CategoryInput {
  name: string;
  description: string | null;
}

export const addCategory = (token: string, restaurantId: string, c: CategoryInput) =>
  post<MenuCategory>(`menus/restaurants/${restaurantId}/categories`, c, { token });

export const updateCategory = (token: string, id: string, c: Partial<CategoryInput>) =>
  patch<MenuCategory>(`menus/categories/${id}`, c, { token });

/** Only an empty category can go. */
export const deleteCategory = (token: string, id: string) => del<void>(`menus/categories/${id}`, { token });

/** Every category id once, in the new order. */
export const orderCategories = (token: string, restaurantId: string, ids: string[]) =>
  put<void>(`menus/restaurants/${restaurantId}/categories/order`, { ids }, { token });

/** ItemCreate: option and group ids are sent back to keep them, so carts that hold them stay valid. */
export interface ItemInput {
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricePaisa: number;
  isAvailable: boolean;
  optionGroups: {
    id?: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { id?: string; name: string; pricePaisa: number; isAvailable: boolean }[];
  }[];
}

export const getItem = (token: string, id: string) =>
  orNull(get<MenuItem & { categoryId: string; restaurantId: string }>(`menus/items/${id}`, { token }));

export const addItem = (token: string, categoryId: string, item: ItemInput) =>
  post<MenuItem>(`menus/categories/${categoryId}/items`, item, { token });

/** Any fields of the item; `categoryId` moves it to the end of another category. */
export const updateItem = (token: string, id: string, change: Partial<ItemInput> & { categoryId?: string }) =>
  patch<MenuItem>(`menus/items/${id}`, change, { token });

export const deleteItem = (token: string, id: string) => del<void>(`menus/items/${id}`, { token });

export const orderItems = (token: string, categoryId: string, ids: string[]) =>
  put<void>(`menus/categories/${categoryId}/items/order`, { ids }, { token });
