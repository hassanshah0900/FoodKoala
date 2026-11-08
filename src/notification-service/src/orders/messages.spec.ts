import { clock, messageFor, ref, rupees } from './messages';
import type { OrderEvent } from './order-events';

const orderId = 'ab12cd34-0000-4000-8000-000000000000';
const customerId = '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10';
const common = { orderId, customerId, customerPhone: '+923001234567', restaurantName: 'Karachi Broast' };

const placed: OrderEvent = {
  id: crypto.randomUUID(),
  type: 'order.placed',
  occurredAt: '2026-11-08T14:10:00.000Z',
  data: { ...common, totals: { totalPaisa: 99900 }, paymentMethod: 'cod', estimatedDeliveryAt: '2026-11-08T14:45:00.000Z' },
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

describe('messageFor', () => {
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
    expect(m).toMatchObject({ kind: 'order_accepted', body: 'Karachi Broast is preparing your order #AB12CD34. Expected around 8:05 pm.' });
    expect(m?.sms).toEqual({ phone: '+923001234567', body: `FoodKoala: ${m?.body}` });
  });

  it('texts when the order is on its way, not when it is ready or delivered', () => {
    expect(messageFor(changed('picked_up', { from: 'ready', by: 'admin' }))?.sms?.body).toBe(
      'FoodKoala: Your order #AB12CD34 from Karachi Broast is on its way.',
    );
    expect(messageFor(changed('ready', { from: 'accepted' }))?.sms).toBeNull();
    expect(messageFor(changed('delivered', { from: 'picked_up', by: 'admin' }))).toMatchObject({ kind: 'order_delivered', sms: null });
  });

  it('explains a rejection and says nothing was charged', () => {
    const m = messageFor(changed('rejected', { reason: 'Out of chicken' }));
    expect(m?.body).toBe("Karachi Broast couldn't take your order #AB12CD34: Out of chicken. You have not been charged.");
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
});
