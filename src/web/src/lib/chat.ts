import type { ChatEvent, ChatMessage, ChatView } from './api/types';

type Role = 'customer' | 'rider';

/** One-tap replies, as people on each side most often need them. */
export const QUICK_REPLIES: Record<Role, string[]> = {
  customer: ['I’m coming down', 'Please call when you arrive', 'Leave it at the gate', 'Ring the bell twice'],
  rider: ['I’m outside', 'On my way', 'Picked up your food', 'I can’t find the address, please call me'],
};

/** The chat after a live event. A repeated message (the same id) is not added twice. */
export function applyEvent(view: ChatView, event: ChatEvent): ChatView {
  switch (event.type) {
    case 'snapshot':
      return event.chat;
    case 'message':
      if (view.messages.some((m) => m.id === event.message.id)) return view;
      return { ...view, messages: [...view.messages, event.message] };
    case 'read':
      return event.role === 'customer'
        ? { ...view, customerReadAt: later(view.customerReadAt, event.readAt) }
        : { ...view, riderReadAt: later(view.riderReadAt, event.readAt) };
  }
}

const later = (a: string | null, b: string) => (a && Date.parse(a) >= Date.parse(b) ? a : b);

const other = (me: Role): Role => (me === 'customer' ? 'rider' : 'customer');
const readAt = (view: ChatView, role: Role) => (role === 'customer' ? view.customerReadAt : view.riderReadAt);

/** The id of my latest message the other side has read, to show "Seen" under; null when none. */
export function lastSeen(view: ChatView): string | null {
  if (!view.me) return null;
  const seen = readAt(view, other(view.me));
  if (!seen) return null;
  const mine = view.messages.filter((m) => m.from === view.me && Date.parse(m.sentAt) <= Date.parse(seen));
  return mine.at(-1)?.id ?? null;
}

/** How many of the other side's messages I haven't read yet. */
export function unread(view: ChatView): number {
  if (!view.me) return 0;
  const mine = readAt(view, view.me);
  return view.messages.filter((m) => m.from !== view.me && (!mine || Date.parse(m.sentAt) > Date.parse(mine))).length;
}

/** Who wrote it, as the reader sees it: "You", the rider's first name, or "Customer". */
export function author(view: ChatView, m: ChatMessage): string {
  if (m.from === view.me) return 'You';
  return m.from === 'rider' ? (view.riderName.split(' ')[0] ?? 'Rider') : 'Customer';
}

/** A fresh id for a message, kept for retries of the same one. */
export const newClientId = () => crypto.randomUUID();
