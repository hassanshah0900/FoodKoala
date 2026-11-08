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

/** The envelope of contracts/README.md#event-envelope, by type. */
export const orderEventSchema = z.discriminatedUnion('type', [
  z.object({ id: z.uuid(), type: z.literal('order.placed'), occurredAt: z.iso.datetime({ offset: true }), data: placedData }),
  z.object({
    id: z.uuid(),
    type: z.literal('order.status_changed'),
    occurredAt: z.iso.datetime({ offset: true }),
    data: statusChangedData,
  }),
]);
export type OrderEvent = z.infer<typeof orderEventSchema>;

export const ORDER_TOPICS = ['order.placed', 'order.status_changed'];
