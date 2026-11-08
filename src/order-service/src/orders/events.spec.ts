import type { OrderRow } from '../db/schema';
import { orderPlaced, orderStatusChanged } from './events';

const order: OrderRow = {
  id: '11111111-1111-4111-8111-111111111111',
  customerId: '22222222-2222-4222-8222-222222222222',
  customerPhone: '+923001234567',
  idempotencyKey: 'key-12345678',
  restaurantId: '33333333-3333-4333-8333-333333333333',
  restaurantName: 'Karachi Broast',
  restaurantLocation: { lat: 24.93, lng: 67.1 },
  deliveryZoneId: '44444444-4444-4444-8444-444444444444',
  status: 'placed',
  paymentMethod: 'cod',
  deliveryAddress: {
    label: 'home',
    line1: 'House 12',
    area: 'Gulshan',
    city: 'Karachi',
    landmark: null,
    instructions: null,
    location: { lat: 24.92, lng: 67.09 },
  },
  note: null,
  subtotalPaisa: 110000,
  deliveryFeePaisa: 9900,
  totalPaisa: 119900,
  prepTimeMinutes: null,
  estimatedDeliveryAt: new Date('2026-11-08T10:35:00Z'),
  placedAt: new Date('2026-11-08T10:00:00Z'),
  updatedAt: new Date('2026-11-08T10:00:00Z'),
};

describe('order events', () => {
  it('wraps order.placed in the envelope, keyed by order id', () => {
    const event = orderPlaced(order, [{ itemId: 'i1', name: 'Zinger', quantity: 2, unitPricePaisa: 55000, lineTotalPaisa: 110000 }]);
    expect(event).toMatchObject({ topic: 'order.placed', key: order.id });
    expect(event.payload).toEqual({
      id: event.eventId,
      type: 'order.placed',
      version: 1,
      occurredAt: '2026-11-08T10:00:00.000Z',
      source: 'order-service',
      data: expect.objectContaining({
        orderId: order.id,
        customerPhone: '+923001234567',
        restaurantName: 'Karachi Broast',
        restaurantLocation: { lat: 24.93, lng: 67.1 },
        totals: { subtotalPaisa: 110000, deliveryFeePaisa: 9900, totalPaisa: 119900 },
        deliveryAddress: { lat: 24.92, lng: 67.09, text: 'House 12, Gulshan, Karachi', landmark: null },
        lines: [{ itemId: 'i1', name: 'Zinger', quantity: 2, unitPricePaisa: 55000, lineTotalPaisa: 110000 }],
      }),
    });
  });

  it('gives every event its own id', () => {
    expect(orderPlaced(order, []).eventId).not.toBe(orderPlaced(order, []).eventId);
  });

  it('describes a status change from and to', () => {
    const at = new Date('2026-11-08T10:05:00Z');
    const event = orderStatusChanged({ ...order, status: 'accepted', prepTimeMinutes: 20 }, { from: 'placed', by: 'restaurant', reason: null, at });
    expect(event.payload.data).toMatchObject({
      from: 'placed',
      to: 'accepted',
      by: 'restaurant',
      prepTimeMinutes: 20,
      customerPhone: '+923001234567',
      restaurantName: 'Karachi Broast',
      at: at.toISOString(),
    });
  });
});
