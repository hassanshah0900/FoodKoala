import { randomUUID } from 'node:crypto';
import type { Actor, OrderLineRow, OrderRow, Status } from '../db/schema';

/** A row for the outbox: the envelope of contracts/README.md#event-envelope, keyed by order id. */
export interface OutboxEvent {
  eventId: string;
  topic: string;
  key: string;
  payload: Envelope;
}

interface Envelope {
  id: string;
  type: string;
  version: 1;
  occurredAt: string;
  source: 'order-service';
  data: unknown;
}

function envelope(type: string, key: string, at: Date, data: unknown): OutboxEvent {
  const id = randomUUID();
  return {
    eventId: id,
    topic: type,
    key,
    payload: { id, type, version: 1, occurredAt: at.toISOString(), source: 'order-service', data },
  };
}

/** contracts/events/order.placed.schema.json */
export function orderPlaced(order: OrderRow, lines: Pick<OrderLineRow, 'itemId' | 'name' | 'quantity' | 'unitPricePaisa' | 'lineTotalPaisa'>[]): OutboxEvent {
  const a = order.deliveryAddress;
  return envelope('order.placed', order.id, order.placedAt, {
    orderId: order.id,
    customerId: order.customerId,
    customerPhone: order.customerPhone,
    restaurantId: order.restaurantId,
    restaurantName: order.restaurantName,
    lines: lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      quantity: l.quantity,
      unitPricePaisa: l.unitPricePaisa,
      lineTotalPaisa: l.lineTotalPaisa,
    })),
    totals: { subtotalPaisa: order.subtotalPaisa, deliveryFeePaisa: order.deliveryFeePaisa, totalPaisa: order.totalPaisa },
    paymentMethod: order.paymentMethod,
    deliveryAddress: { lat: a.location.lat, lng: a.location.lng, text: `${a.line1}, ${a.area}, ${a.city}`, landmark: a.landmark },
    estimatedDeliveryAt: order.estimatedDeliveryAt.toISOString(),
    placedAt: order.placedAt.toISOString(),
  });
}

/** contracts/events/order.status_changed.schema.json */
export function orderStatusChanged(order: OrderRow, change: { from: Status; by: Actor; reason: string | null; at: Date }): OutboxEvent {
  return envelope('order.status_changed', order.id, change.at, {
    orderId: order.id,
    customerId: order.customerId,
    customerPhone: order.customerPhone,
    restaurantId: order.restaurantId,
    restaurantName: order.restaurantName,
    from: change.from,
    to: order.status,
    by: change.by,
    reason: change.reason,
    prepTimeMinutes: order.prepTimeMinutes,
    estimatedDeliveryAt: order.estimatedDeliveryAt.toISOString(),
    at: change.at.toISOString(),
  });
}
