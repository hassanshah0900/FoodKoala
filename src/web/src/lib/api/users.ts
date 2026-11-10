import { get, post } from './http';
import type { Address, Point } from './types';

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
