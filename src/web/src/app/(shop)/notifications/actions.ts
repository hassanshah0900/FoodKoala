'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/api/notifications';
import { accessToken, requireUser } from '@/lib/session';

/** Marks the notification read and goes where it points (a form, so a prefetch never marks anything). */
export async function openNotification(id: string, href: string | null) {
  await requireUser('/notifications');
  await markNotificationRead((await accessToken())!, id).catch(() => undefined);
  revalidatePath('/', 'layout');
  redirect(href ?? '/notifications');
}

export async function readAll() {
  await requireUser('/notifications');
  await markAllNotificationsRead((await accessToken())!);
  revalidatePath('/', 'layout');
}
