import { markRead } from '@/lib/api/chat';
import { asUser } from '@/lib/chat-route';

/** I have read the chat up to now. */
export const POST = (_: Request, ctx: { params: Promise<{ orderId: string }> }) =>
  asUser(ctx, async (token, orderId) => {
    await markRead(token, orderId);
    return new Response(null, { status: 204 });
  });
