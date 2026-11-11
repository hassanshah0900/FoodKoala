import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatView } from './api/types';
import { applyEvent, author, lastSeen, unread } from './chat';

const msg = (id: string, from: ChatMessage['from'], at: string): ChatMessage => ({
  id,
  from,
  clientId: `c-${id}`,
  text: id,
  photo: null,
  sentAt: `2026-11-11T12:${at}:00Z`,
});

const view: ChatView = {
  orderId: 'o1',
  riderName: 'Imran Ali',
  restaurantName: 'Karahi Darbar',
  closesAt: null,
  customerReadAt: null,
  riderReadAt: null,
  me: 'customer',
  open: true,
  messages: [msg('a', 'customer', '00'), msg('b', 'rider', '01'), msg('c', 'customer', '02')],
};

describe('applyEvent', () => {
  it('adds a new message once', () => {
    const next = applyEvent(view, { type: 'message', message: msg('d', 'rider', '03') });
    expect(next.messages.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(applyEvent(next, { type: 'message', message: msg('d', 'rider', '03') })).toBe(next);
  });

  it('moves read marks forward only', () => {
    const read = applyEvent(view, { type: 'read', role: 'rider', readAt: '2026-11-11T12:02:00Z' });
    expect(read.riderReadAt).toBe('2026-11-11T12:02:00Z');
    expect(applyEvent(read, { type: 'read', role: 'rider', readAt: '2026-11-11T12:00:00Z' }).riderReadAt).toBe(
      '2026-11-11T12:02:00Z',
    );
  });

  it('takes a snapshot whole', () => {
    const snap = { ...view, messages: [] };
    expect(applyEvent(view, { type: 'snapshot', chat: snap })).toBe(snap);
  });
});

describe('lastSeen', () => {
  it('is my latest message the other side read up to', () => {
    expect(lastSeen(view)).toBeNull();
    expect(lastSeen({ ...view, riderReadAt: '2026-11-11T12:01:30Z' })).toBe('a');
    expect(lastSeen({ ...view, riderReadAt: '2026-11-11T12:05:00Z' })).toBe('c');
  });

  it('is nothing for an admin reading along', () => {
    expect(lastSeen({ ...view, me: '', riderReadAt: '2026-11-11T12:05:00Z' })).toBeNull();
  });
});

describe('unread', () => {
  it('counts the other side’s messages after my read mark', () => {
    expect(unread(view)).toBe(1);
    expect(unread({ ...view, customerReadAt: '2026-11-11T12:01:00Z' })).toBe(0);
    expect(unread({ ...view, me: 'rider' })).toBe(2);
  });
});

describe('author', () => {
  it('says You, the rider’s first name, or Customer', () => {
    expect(author(view, view.messages[0])).toBe('You');
    expect(author(view, view.messages[1])).toBe('Imran');
    expect(author({ ...view, me: 'rider' }, view.messages[0])).toBe('Customer');
  });
});
