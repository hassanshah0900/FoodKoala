import 'server-only';
import { get, post } from './http';
import type { NotificationPage } from './types';

/** My inbox, newest first, with how many are unread. */
export const myNotifications = (token: string, page = 1, limit = 20) =>
  get<NotificationPage>('notifications', { token, query: { page, limit } });

/** Just the unread count, for the bell. */
export const unreadCount = async (token: string) =>
  (await get<NotificationPage>('notifications', { token, query: { unread: 'true', limit: 1 } })).unreadCount;

export const markNotificationRead = (token: string, id: string) =>
  post<void>(`notifications/${id}/read`, undefined, { token });

export const markAllNotificationsRead = (token: string) => post<void>('notifications/read-all', undefined, { token });
