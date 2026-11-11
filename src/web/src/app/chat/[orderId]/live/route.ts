import { watchChat } from '@/lib/api/chat';
import { asUser } from '@/lib/chat-route';
import { relaySocket } from '@/lib/socket-relay';

/** The chat's live events for the browser, as Server-Sent Events `chat`; `end` once the caller is no longer in it (1008). */
export const GET = (request: Request, ctx: { params: Promise<{ orderId: string }> }) =>
  asUser(ctx, async (token, orderId) => relaySocket(request, watchChat(token, orderId), 'chat', [1008]));
