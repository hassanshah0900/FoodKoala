import type { Kind } from '../db/schema';
import type { OrderEvent } from './order-events';

/** What to tell the customer about an event: always an inbox entry, sometimes an SMS too. */
export interface Message {
  userId: string;
  kind: Kind;
  title: string;
  body: string;
  data: Record<string, string>;
  /** Set when the news is worth a text: something the customer should act on or wait for. */
  sms: { phone: string; body: string } | null;
}

const KARACHI_TIME = new Intl.DateTimeFormat('en-PK', {
  timeZone: 'Asia/Karachi',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** 7:45 pm, in Pakistan time. */
export const clock = (iso: string) =>
  KARACHI_TIME.format(new Date(iso)).replace(/\s?([AP]M)$/i, (_, m: string) => ` ${m.toLowerCase()}`);

/** Rs 999, or Rs 999.50. */
export const rupees = (paisa: number) =>
  `Rs ${paisa % 100 === 0 ? (paisa / 100).toLocaleString('en-PK') : (paisa / 100).toFixed(2)}`;

/** A short order reference people can read out on the phone: the first 8 characters of the id. */
export const ref = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

const because = (reason: string | null) => (reason ? `: ${reason}` : '');

const VEHICLE: Record<string, string> = { motorbike: 'on a motorbike', bicycle: 'on a bicycle', car: 'by car' };

/**
 * Everyone's message about an event: the customer's, and for a new delivery
 * the rider's too. Empty when there is nothing to say.
 */
export function messagesFor(event: OrderEvent): Message[] {
  if (event.type === 'delivery.assigned') {
    const d = event.data;
    const order = ref(d.orderId);
    const how = VEHICLE[d.vehicle] ? ` ${VEHICLE[d.vehicle]}` : '';
    const job = `New delivery ${order}: collect it from ${d.restaurantName}.`;
    return [
      {
        userId: d.customerId,
        kind: 'rider_assigned',
        title: 'Rider assigned',
        body: `${d.riderName} is bringing your order ${order}${how}. You can call them on ${d.riderPhone}.`,
        data: { orderId: d.orderId, riderId: d.riderId },
        // The customer's next text comes when the food is on its way.
        sms: null,
      },
      {
        userId: d.riderId,
        kind: 'delivery_assigned',
        title: 'New delivery',
        body: `${job} The customer's number is ${d.customerPhone}.`,
        data: { orderId: d.orderId },
        // Riders may have the app in their pocket: a text makes sure they see it.
        sms: { phone: d.riderPhone, body: `FoodKoala: ${job} Open the rider app for the details.` },
      },
    ];
  }
  const m = customerMessage(event);
  return m ? [m] : [];
}

function customerMessage(event: Exclude<OrderEvent, { type: 'delivery.assigned' }>): Message | null {
  const d = event.data;
  const base = { userId: d.customerId, data: { orderId: d.orderId } };
  const order = ref(d.orderId);
  const sms = (body: string) => ({ phone: d.customerPhone, body: `FoodKoala: ${body}` });

  if (event.type === 'order.placed') {
    const { totals, paymentMethod, estimatedDeliveryAt } = event.data;
    const paying =
      paymentMethod === 'cod'
        ? `Pay ${rupees(totals.totalPaisa)} in cash on delivery.`
        : `Total ${rupees(totals.totalPaisa)}.`;
    return {
      ...base,
      kind: 'order_placed',
      title: 'Order placed',
      body: `${d.restaurantName} has your order ${order}. ${paying} Expected around ${clock(estimatedDeliveryAt)}.`,
      sms: null,
    };
  }

  const c = event.data;
  switch (c.to) {
    case 'accepted': {
      const eta = c.estimatedDeliveryAt ? ` Expected around ${clock(c.estimatedDeliveryAt)}.` : '';
      const body = `${c.restaurantName} is preparing your order ${order}.${eta}`;
      return { ...base, kind: 'order_accepted', title: 'Order accepted', body, sms: sms(body) };
    }
    case 'ready':
      return {
        ...base,
        kind: 'order_ready',
        title: 'Food is ready',
        body: `Your order ${order} is packed and waiting for the rider.`,
        sms: null,
      };
    case 'picked_up': {
      const body = `Your order ${order} from ${c.restaurantName} is on its way.`;
      return { ...base, kind: 'order_picked_up', title: 'On its way', body, sms: sms(body) };
    }
    case 'delivered':
      return {
        ...base,
        kind: 'order_delivered',
        title: 'Delivered',
        body: `Your order ${order} has been delivered. Enjoy your meal!`,
        sms: null,
      };
    case 'rejected': {
      const body = `${c.restaurantName} couldn't take your order ${order}${because(c.reason)}. You have not been charged.`;
      return { ...base, kind: 'order_rejected', title: 'Order not accepted', body, sms: sms(body) };
    }
    case 'cancelled': {
      // Customers who cancelled themselves know already; no text for them.
      const byCustomer = c.by === 'customer';
      const body = byCustomer
        ? `You cancelled your order ${order}.`
        : `Your order ${order} from ${c.restaurantName} was cancelled${because(c.reason)}. You have not been charged.`;
      return { ...base, kind: 'order_cancelled', title: 'Order cancelled', body, sms: byCustomer ? null : sms(body) };
    }
    default:
      return null;
  }
}
