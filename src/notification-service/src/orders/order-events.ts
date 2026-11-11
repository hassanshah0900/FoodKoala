import { z } from 'zod';

const statuses = z.enum(['placed', 'accepted', 'ready', 'picked_up', 'delivered', 'rejected', 'cancelled']);

/** contracts/events/order.placed.schema.json, the fields we use. Extra fields are allowed. */
const placedData = z.object({
  orderId: z.uuid(),
  customerId: z.uuid(),
  customerPhone: z.string().regex(/^\+\d{8,15}$/),
  restaurantName: z.string().min(1),
  totals: z.object({ totalPaisa: z.int().nonnegative() }),
  paymentMethod: z.string(),
  estimatedDeliveryAt: z.iso.datetime({ offset: true }),
});

/** contracts/events/order.status_changed.schema.json, the fields we use. */
const statusChangedData = z.object({
  orderId: z.uuid(),
  customerId: z.uuid(),
  customerPhone: z.string().regex(/^\+\d{8,15}$/),
  restaurantName: z.string().min(1),
  from: statuses,
  to: statuses,
  // Any actor: a new one (like `rider`) must not turn events into "malformed" ones that get skipped.
  by: z.string().min(1),
  reason: z.string().nullable(),
  estimatedDeliveryAt: z.iso.datetime({ offset: true }).optional(),
});

/** contracts/events/delivery.assigned.schema.json, the fields we use. */
const assignedData = z.object({
  orderId: z.uuid(),
  riderId: z.uuid(),
  riderName: z.string().min(1),
  riderPhone: z.string().regex(/^\+\d{8,15}$/),
  vehicle: z.string(),
  customerId: z.uuid(),
  customerPhone: z.string().regex(/^\+\d{8,15}$/),
  restaurantName: z.string().min(1),
});

/** contracts/events/chat.message_waiting.schema.json, the fields we use. */
const chatWaitingData = z.object({
  orderId: z.uuid(),
  recipientId: z.uuid(),
  recipientRole: z.enum(['customer', 'rider']),
  recipientPhone: z.string().regex(/^\+\d{8,15}$/),
  senderName: z.string().min(1).nullable(),
  unread: z.int().positive(),
  preview: z.string(),
  photo: z.boolean(),
});

/** The envelope of contracts/README.md#event-envelope, by type. */
export const orderEventSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.uuid(),
    type: z.literal('order.placed'),
    occurredAt: z.iso.datetime({ offset: true }),
    data: placedData,
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('order.status_changed'),
    occurredAt: z.iso.datetime({ offset: true }),
    data: statusChangedData,
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('delivery.assigned'),
    occurredAt: z.iso.datetime({ offset: true }),
    data: assignedData,
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('chat.message_waiting'),
    occurredAt: z.iso.datetime({ offset: true }),
    data: chatWaitingData,
  }),
]);
export type OrderEvent = z.infer<typeof orderEventSchema>;

/** Everything about an order someone should hear of: its steps, its rider, and chat messages they haven't seen. */
export const ORDER_TOPICS = ['order.placed', 'order.status_changed', 'delivery.assigned', 'chat.message_waiting'];
