import { unreadCount } from '@/lib/api/notifications';
import { accessToken } from '@/lib/session';

/** `{ count }`: my unread notifications, for the bell to poll. */
export async function GET() {
  const token = await accessToken();
  if (!token) return Response.json({ count: 0 }, { status: 401 });
  return Response.json({ count: await unreadCount(token).catch(() => 0) });
}
