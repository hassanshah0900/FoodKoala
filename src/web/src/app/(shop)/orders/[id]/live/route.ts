import { watchTracking } from '@/lib/api/tracking';
import { isUuid } from '@/lib/params';
import { accessToken } from '@/lib/session';
import { sseEvent, sseRetry } from '@/lib/sse';

/** Browsers reconnect this long after the stream breaks (tracking-service restarting, a network blip). */
const RECONNECT_MS = 5000;

/**
 * The order's live tracking for the browser, as Server-Sent Events. The server holds the socket to
 * tracking-service, so the access token stays in its httpOnly cookie. Events: `tracking` (a whole
 * Tracking, on every change) and `end` once the order is finished, when the browser should stop listening.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await accessToken();
  if (!token) return new Response(null, { status: 401 });
  if (!isUuid(id)) return new Response(null, { status: 404 });

  const ws = watchTracking(token, id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (text: string) => open && controller.enqueue(encoder.encode(text));
      const finish = () => {
        if (open) controller.close();
        open = false;
      };
      write(sseRetry(RECONNECT_MS));
      ws.onmessage = (e) => write(sseEvent('tracking', String(e.data)));
      // 1000 is the server's goodbye after the last message; anything else ends the stream so the browser retries.
      ws.onclose = (e) => {
        if (e.code === 1000) write(sseEvent('end', '{}'));
        finish();
      };
      request.signal.addEventListener('abort', () => {
        ws.close();
        finish();
      });
    },
    cancel() {
      ws.close();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform' },
  });
}
