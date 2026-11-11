import { del, get, patch, post, put } from './http';
import type { Address, Favourite, Point, Profile } from './types';

export interface NewAddress {
  label: Address['label'];
  labelText: string | null;
  line1: string;
  area: string;
  city: string;
  landmark: string | null;
  instructions: string | null;
  location: Point;
}

/** The customer's saved addresses, default first (user-service). */
export const myAddresses = (token: string) => get<Address[]>('users/me/addresses', { token });

export const saveAddress = (token: string, address: NewAddress) =>
  post<Address>('users/me/addresses', address, { token });

/** The profile (user-service makes it on the first call). */
export const myProfile = (token: string) => get<Profile>('users/me', { token });

export const updateProfile = (token: string, change: Partial<Pick<Profile, 'name' | 'email' | 'preferredLanguage'>>) =>
  patch<Profile>('users/me', change, { token });

/** Makes the address the one checkout picks first. */
export const makeDefaultAddress = (token: string, id: string) =>
  patch<Address>(`users/me/addresses/${id}`, { isDefault: true }, { token });

export const deleteAddress = (token: string, id: string) => del<void>(`users/me/addresses/${id}`, { token });

export const myFavourites = (token: string) => get<Favourite[]>('users/me/favourites', { token });

export const addFavourite = (token: string, restaurantId: string) =>
  put<void>(`users/me/favourites/${restaurantId}`, undefined, { token });

export const removeFavourite = (token: string, restaurantId: string) =>
  del<void>(`users/me/favourites/${restaurantId}`, { token });
