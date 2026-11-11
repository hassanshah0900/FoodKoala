import { sendPhoto } from '@/lib/api/chat';
import { asUser } from '@/lib/chat-route';

/** Sends a photo: the browser's form (`photo`, `clientId`, `caption`) goes on to chat-service as it is. */
export const POST = (request: Request, ctx: { params: Promise<{ orderId: string }> }) =>
  asUser(ctx, async (token, orderId) => Response.json(await sendPhoto(token, orderId, await request.formData())));
