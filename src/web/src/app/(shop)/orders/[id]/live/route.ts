import { watchTracking } from '@/lib/api/tracking';
import { isUuid } from '@/lib/params';
import { accessToken } from '@/lib/session';
import { relaySocket } from '@/lib/socket-relay';

/**
 * The order's live tracking for the browser, as Server-Sent Events: `tracking` (a whole Tracking,
 * on every change) and `end` once the order is finished (the socket's normal close, 1000).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await accessToken();
  if (!token) return new Response(null, { status: 401 });
  if (!isUuid(id)) return new Response(null, { status: 404 });
  return relaySocket(request, watchTracking(token, id), 'tracking', [1000]);
}
