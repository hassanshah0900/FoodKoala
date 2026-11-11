import 'server-only';
import { ApiError } from './api/http';
import { isUuid } from './params';
import { accessToken } from './session';

type Params = { params: Promise<{ orderId: string }> };

/**
 * A chat route for the browser: signed in (401 otherwise), a real order id (404), and chat-service's
 * refusals passed on with their status and message, for the chat panel to show.
 */
export async function asUser(ctx: Params, act: (token: string, orderId: string) => Promise<Response>) {
  const { orderId } = await ctx.params;
  const token = await accessToken();
  if (!token) return Response.json({ message: 'Sign in again' }, { status: 401 });
  if (!isUuid(orderId)) return Response.json({ message: 'No chat for this order' }, { status: 404 });
  try {
    return await act(token, orderId);
  } catch (err) {
    if (err instanceof ApiError) return Response.json({ message: err.message }, { status: err.status });
    throw err;
  }
}
