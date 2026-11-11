import { chatMessage, clock, messagesFor, ref, rupees } from './messages';
import { type OrderEvent, orderEventSchema } from './order-events';

const orderId = 'ab12cd34-0000-4000-8000-000000000000';
const customerId = '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10';
const common = { orderId, customerId, customerPhone: '+923001234567', restaurantName: 'Karachi Broast' };

const placed: OrderEvent = {
  id: crypto.randomUUID(),
  type: 'order.placed',
  occurredAt: '2026-11-08T14:10:00.000Z',
  data: {
    ...common,
    totals: { totalPaisa: 99900 },
    paymentMethod: 'cod',
    estimatedDeliveryAt: '2026-11-08T14:45:00.000Z',
  },
};
const changed = (to: string, extra: object = {}): OrderEvent =>
  ({
    id: crypto.randomUUID(),
    type: 'order.status_changed',
    occurredAt: '2026-11-08T14:12:00.000Z',
    data: { ...common, from: 'placed', to, by: 'restaurant', reason: null, ...extra },
  }) as OrderEvent;

describe('formatting', () => {
  it('shows Pakistan time, rupees and a short reference', () => {
    expect(clock('2026-11-08T14:45:00.000Z')).toBe('7:45 pm');
    expect(rupees(99900)).toBe('Rs 999');
    expect(rupees(150000)).toBe('Rs 1,500');
    expect(rupees(49950)).toBe('Rs 499.50');
    expect(ref(orderId)).toBe('#AB12CD34');
  });
});

/** The customer's message, for events that concern only them. */
const messageFor = (e: OrderEvent) => {
  const all = messagesFor(e);
  expect(all.length).toBeLessThanOrEqual(1);
  return all[0] ?? null;
};

describe('messagesFor', () => {
  it('confirms a placed order in the inbox only', () => {
    expect(messageFor(placed)).toEqual({
      userId: customerId,
      kind: 'order_placed',
      title: 'Order placed',
      body: 'Karachi Broast has your order #AB12CD34. Pay Rs 999 in cash on delivery. Expected around 7:45 pm.',
      data: { orderId },
      sms: null,
    });
  });

  it('texts the customer when the restaurant accepts, with the time', () => {
    const m = messageFor(changed('accepted', { estimatedDeliveryAt: '2026-11-08T15:05:00.000Z' }));
    expect(m).toMatchObject({
      kind: 'order_accepted',
      body: 'Karachi Broast is preparing your order #AB12CD34. Expected around 8:05 pm.',
    });
    expect(m?.sms).toEqual({ phone: '+923001234567', body: `FoodKoala: ${m?.body}` });
  });

  it('texts when the order is on its way, not when it is ready or delivered', () => {
    expect(messageFor(changed('picked_up', { from: 'ready', by: 'rider' }))?.sms?.body).toBe(
      'FoodKoala: Your order #AB12CD34 from Karachi Broast is on its way.',
    );
    expect(messageFor(changed('ready', { from: 'accepted' }))?.sms).toBeNull();
    expect(messageFor(changed('delivered', { from: 'picked_up', by: 'admin' }))).toMatchObject({
      kind: 'order_delivered',
      sms: null,
    });
  });

  it('explains a rejection and says nothing was charged', () => {
    const m = messageFor(changed('rejected', { reason: 'Out of chicken' }));
    expect(m?.body).toBe(
      "Karachi Broast couldn't take your order #AB12CD34: Out of chicken. You have not been charged.",
    );
    expect(m?.sms).not.toBeNull();
  });

  it('texts about a cancellation only when someone else cancelled', () => {
    const mine = messageFor(changed('cancelled', { by: 'customer' }));
    expect(mine).toMatchObject({ body: 'You cancelled your order #AB12CD34.', sms: null });
    const theirs = messageFor(changed('cancelled', { by: 'admin', from: 'accepted', reason: 'Rider unavailable' }));
    expect(theirs?.sms?.body).toBe(
      'FoodKoala: Your order #AB12CD34 from Karachi Broast was cancelled: Rider unavailable. You have not been charged.',
    );
  });

  it('reads events from actors it does not know yet', () => {
    const event = {
      id: crypto.randomUUID(),
      type: 'order.status_changed',
      occurredAt: new Date().toISOString(),
      data: { ...common, from: 'picked_up', to: 'delivered', by: 'rider', reason: null },
    };
    expect(orderEventSchema.parse(event).data).toMatchObject({ by: 'rider' });
  });

  it('tells the customer who their rider is, and briefs the rider by text', () => {
    const riderId = crypto.randomUUID();
    const event = orderEventSchema.parse({
      id: crypto.randomUUID(),
      type: 'delivery.assigned',
      occurredAt: new Date().toISOString(),
      data: {
        deliveryId: crypto.randomUUID(),
        orderId,
        riderId,
        riderName: 'Ali Raza',
        riderPhone: '+923009876543',
        vehicle: 'motorbike',
        at: new Date().toISOString(),
        customerId,
        customerPhone: '+923001234567',
        restaurantName: 'Karachi Broast',
      },
    });
    const [customer, rider] = messagesFor(event);
    expect(customer).toEqual({
      userId: customerId,
      kind: 'rider_assigned',
      title: 'Rider assigned',
      body: 'Ali Raza is bringing your order #AB12CD34 on a motorbike. You can call them on +923009876543.',
      data: { orderId, riderId },
      sms: null,
    });
    expect(rider).toEqual({
      userId: riderId,
      kind: 'delivery_assigned',
      title: 'New delivery',
      body: "New delivery #AB12CD34: collect it from Karachi Broast. The customer's number is +923001234567.",
      data: { orderId },
      sms: {
        phone: '+923009876543',
        body: 'FoodKoala: New delivery #AB12CD34: collect it from Karachi Broast. Open the rider app for the details.',
      },
    });
  });
});

describe('chat messages waiting', () => {
  const riderId = '5b1f8e2a-0000-4000-8000-000000000001';
  const waiting = (over: object = {}) =>
    ({
      id: crypto.randomUUID(),
      type: 'chat.message_waiting',
      occurredAt: '2026-11-08T14:30:00.000Z',
      data: {
        orderId,
        recipientId: customerId,
        recipientRole: 'customer',
        recipientPhone: '+923001234567',
        senderRole: 'rider',
        senderName: 'Imran Ali',
        restaurantName: 'Karachi Broast',
        unread: 1,
        preview: 'Two minutes away',
        photo: false,
        since: '2026-11-08T14:29:00.000Z',
        ...over,
      },
    }) as OrderEvent;

  it('tells the customer what their rider wrote, in the inbox and by text', () => {
    const [m] = messagesFor(orderEventSchema.parse(waiting()));
    expect(m).toEqual({
      userId: customerId,
      kind: 'chat_message',
      title: 'Message from Imran',
      body: 'Imran: "Two minutes away"',
      data: { orderId, chat: 'customer' },
      sms: {
        phone: '+923001234567',
        body: 'FoodKoala: Imran, your rider, sent you "Two minutes away". Reply in the FoodKoala app.',
      },
    });
  });

  it("tells the rider about the order, never the customer's name", () => {
    const m = chatMessage(
      (
        waiting({
          recipientId: riderId,
          recipientRole: 'rider',
          recipientPhone: '+923000000031',
          senderRole: 'customer',
          senderName: null,
          unread: 3,
          preview: '',
          photo: true,
        }) as Extract<OrderEvent, { type: 'chat.message_waiting' }>
      ).data,
    );
    expect(m.userId).toBe(riderId);
    expect(m.title).toBe(`Message about order ${ref(orderId)}`);
    expect(m.body).toBe('The customer: a photo (3 new messages)');
    expect(m.sms?.body).toBe(
      `FoodKoala: the customer of order ${ref(orderId)} sent you a photo (3 new messages). Reply in the rider app.`,
    );
  });

  it('refuses an event without a phone to text', () => {
    expect(orderEventSchema.safeParse(waiting({ recipientPhone: 'none' })).success).toBe(false);
  });
});
