import { sendMessage } from '@/lib/api/chat';
import { asUser } from '@/lib/chat-route';

/** Sends a text message: `{ clientId, text }`, as chat-service takes it. */
export const POST = (request: Request, ctx: { params: Promise<{ orderId: string }> }) =>
  asUser(ctx, async (token, orderId) => {
    const body = (await request.json().catch(() => ({}))) as { clientId?: unknown; text?: unknown };
    const message = await sendMessage(token, orderId, {
      clientId: String(body.clientId ?? ''),
      text: String(body.text ?? ''),
    });
    return Response.json(message);
  });
