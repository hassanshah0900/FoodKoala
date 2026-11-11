import { chatPhoto } from '@/lib/api/chat';
import { asUser } from '@/lib/chat-route';
import { isUuid } from '@/lib/params';

/** A chat photo's bytes, for an <img>: only for the people in the chat, cached privately. */
export const GET = (_: Request, ctx: { params: Promise<{ orderId: string; photoId: string }> }) =>
  asUser(ctx, async (token, orderId) => {
    const { photoId } = await ctx.params;
    if (!isUuid(photoId)) return new Response(null, { status: 404 });
    const photo = await chatPhoto(token, orderId, photoId);
    return new Response(photo.body, {
      headers: {
        'content-type': photo.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': 'private, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  });
