import 'server-only';
import { get, orNull, post, requestRaw, socket } from './http';
import type { ChatMessage, ChatView } from './types';

const LIVE_PROTOCOL = 'foodkoala.chat.v1';
const base = (orderId: string) => `chat/orders/${orderId}`;

/** The order's chat; null before a rider is assigned, or for someone who isn't in it. */
export const getChat = (token: string, orderId: string) => orNull(get<ChatView>(base(orderId), { token }));

export const sendMessage = (token: string, orderId: string, message: { clientId: string; text: string }) =>
  post<ChatMessage>(`${base(orderId)}/messages`, message, { token });

/** `form` holds `photo`, `clientId` and an optional `caption`, as chat-service takes them. */
export const sendPhoto = async (token: string, orderId: string, form: FormData) =>
  (await (await requestRaw('POST', `${base(orderId)}/photos`, { token, body: form })).json()) as ChatMessage;

/** The photo's bytes, to pass on to the browser. */
export const chatPhoto = (token: string, orderId: string, photoId: string) =>
  requestRaw('GET', `${base(orderId)}/photos/${photoId}`, { token });

export const markRead = (token: string, orderId: string) => post<void>(`${base(orderId)}/read`, undefined, { token });

/** A socket that sends a snapshot, then every message and read receipt. */
export const watchChat = (token: string, orderId: string) => socket(`${base(orderId)}/live`, LIVE_PROTOCOL, token);
