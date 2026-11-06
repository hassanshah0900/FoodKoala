import type { CategoryRow, ItemRow } from '../db/schema';

/** API shape of Category (position is implied by list order). */
export type Category = Omit<CategoryRow, 'position'>;
/** API shape of Item. */
export type Item = Omit<ItemRow, 'position'>;

export const toCategory = ({ position: _position, ...rest }: CategoryRow): Category => rest;
export const toItem = ({ position: _position, ...rest }: ItemRow): Item => rest;
