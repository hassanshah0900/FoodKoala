import { describe, expect, it } from 'vitest';
import { badge, notificationHref } from './notifications';

const orderId = '950c29c4-58af-4636-9c70-4fef79efadea';

describe('notificationHref', () => {
  it('opens the order for the customer', () => {
    expect(notificationHref({ kind: 'order_accepted', data: { orderId } })).toBe(`/orders/${orderId}`);
    expect(notificationHref({ kind: 'chat_message', data: { orderId, chat: 'customer' } })).toBe(`/orders/${orderId}`);
  });

  it('opens the rider app for the rider', () => {
    expect(notificationHref({ kind: 'delivery_assigned', data: { orderId } })).toBe('/rider');
    expect(notificationHref({ kind: 'chat_message', data: { orderId, chat: 'rider' } })).toBe('/rider');
  });

  it('goes nowhere without an order', () => {
    expect(notificationHref({ kind: 'something_new', data: {} })).toBeNull();
  });
});

describe('badge', () => {
  it('stays short', () => {
    expect(badge(3)).toBe('3');
    expect(badge(12)).toBe('9+');
  });
});
