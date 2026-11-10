'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { refusal } from '@/lib/api/http';
import {
  addCategory,
  addItem,
  deleteCategory,
  deleteItem,
  freshMenu,
  orderCategories,
  orderItems,
  updateCategory,
  updateItem,
} from '@/lib/api/menus';
import { formValues } from '@/lib/form-values';
import { moved, readItemForm } from '@/lib/menu-editing';
import { requireOwner } from '@/lib/owner';

export type MenuFormState = { errors?: string[]; values?: Record<string, string> };

/** The owner's console and the customers' page both show the menu. */
const changed = (restaurantId: string) => {
  revalidatePath(`/vendor/${restaurantId}/menu`);
  revalidatePath(`/restaurant/${restaurantId}`);
};

/** Runs a menu change; a refusal from menu-service becomes the form's message. */
async function attempt(call: () => Promise<unknown>, values?: Record<string, string>): Promise<MenuFormState | null> {
  try {
    await call();
    return null;
  } catch (err) {
    const error = refusal(err);
    if (error === null) throw err;
    return { errors: error.split('; '), values };
  }
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export async function addCategoryAction(restaurantId: string, _prev: MenuFormState, form: FormData) {
  const { token } = await requireOwner(restaurantId);
  const name = text(form, 'name');
  if (!name) return { errors: ['Give the category a name, e.g. Biryani.'] };
  const failed = await attempt(() =>
    addCategory(token, restaurantId, { name, description: text(form, 'description') || null }),
  );
  if (failed) return failed;
  changed(restaurantId);
  return {};
}

export async function renameCategory(
  restaurantId: string,
  categoryId: string,
  _prev: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const { token } = await requireOwner(restaurantId);
  const name = text(form, 'name');
  if (!name) return { errors: ['A category needs a name.'] };
  const failed = await attempt(() =>
    updateCategory(token, categoryId, { name, description: text(form, 'description') || null }),
  );
  if (failed) return failed;
  changed(restaurantId);
  return {};
}

export async function removeCategory(restaurantId: string, categoryId: string): Promise<void> {
  const { token } = await requireOwner(restaurantId);
  await deleteCategory(token, categoryId);
  changed(restaurantId);
}

/** Swaps a category with the one above (-1) or below (+1). */
export async function moveCategory(restaurantId: string, categoryId: string, by: -1 | 1): Promise<void> {
  const { token } = await requireOwner(restaurantId);
  const ids = (await freshMenu(token, restaurantId)).categories.map((c) => c.id);
  await orderCategories(token, restaurantId, moved(ids, categoryId, by));
  changed(restaurantId);
}

export async function moveItem(restaurantId: string, categoryId: string, itemId: string, by: -1 | 1): Promise<void> {
  const { token } = await requireOwner(restaurantId);
  const category = (await freshMenu(token, restaurantId)).categories.find((c) => c.id === categoryId);
  if (!category) return;
  await orderItems(
    token,
    categoryId,
    moved(
      category.items.map((i) => i.id),
      itemId,
      by,
    ),
  );
  changed(restaurantId);
}

/** Sold out, or back on: the quickest change a kitchen makes. */
export async function setItemAvailable(restaurantId: string, itemId: string, isAvailable: boolean): Promise<void> {
  const { token } = await requireOwner(restaurantId);
  await updateItem(token, itemId, { isAvailable });
  changed(restaurantId);
}

/** Creates the item (no `itemId`) or saves it, moving it if its category changed, then back to the menu. */
export async function saveItem(
  restaurantId: string,
  itemId: string | null,
  _prev: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const { token } = await requireOwner(restaurantId);
  const values = formValues(form);
  const read = readItemForm((name) => values[name] ?? '');
  if ('errors' in read) return { errors: read.errors, values };
  const { categoryId, currentCategoryId } = values;
  // Sending the category it is already in would still move it to the end.
  const move = categoryId !== currentCategoryId ? { categoryId } : {};
  const failed = await attempt(
    () => (itemId ? updateItem(token, itemId, { ...read.item, ...move }) : addItem(token, categoryId, read.item)),
    values,
  );
  if (failed) return failed;
  changed(restaurantId);
  redirect(`/vendor/${restaurantId}/menu`);
}

export async function removeItem(restaurantId: string, itemId: string): Promise<void> {
  const { token } = await requireOwner(restaurantId);
  await deleteItem(token, itemId);
  changed(restaurantId);
  redirect(`/vendor/${restaurantId}/menu`);
}
