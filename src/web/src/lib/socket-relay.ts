import 'server-only';
import { sseEvent, sseRetry } from './sse';

/** Browsers reconnect this long after the stream breaks (a service restarting, a network blip). */
const RECONNECT_MS = 5000;

/**
 * Passes a service's WebSocket on to the browser as Server-Sent Events, so the server holds the
 * socket and the access token stays in its httpOnly cookie. Each socket message becomes an `event`
 * event. When the socket closes with one of `endCodes` the browser gets `end` and should stop
 * listening; any other close just ends the stream, and the browser reconnects.
 */
export function relaySocket(request: Request, ws: WebSocket, event: string, endCodes: number[]): Response {
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
      ws.onmessage = (e) => write(sseEvent(event, String(e.data)));
      ws.onclose = (e) => {
        if (endCodes.includes(e.code)) write(sseEvent('end', '{}'));
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
