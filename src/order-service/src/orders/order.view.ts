import type {
  Actor,
  DeliveryAddress,
  LineOption,
  OrderLineRow,
  OrderRow,
  PaymentMethod,
  Status,
  StatusHistoryRow,
} from '../db/schema';

/** Order in contracts/openapi/order-service.yaml. */
export interface Order {
  id: string;
  status: Status;
  customerId: string;
  customerPhone: string;
  restaurant: { id: string; name: string; location: { lat: number; lng: number } | null };
  lines: {
    itemId: string;
    name: string;
    quantity: number;
    options: LineOption[];
    note: string | null;
    unitPricePaisa: number;
    lineTotalPaisa: number;
  }[];
  subtotalPaisa: number;
  deliveryFeePaisa: number;
  discountPaisa: number;
  voucherCode: string | null;
  totalPaisa: number;
  paymentMethod: PaymentMethod;
  deliveryAddress: DeliveryAddress;
  note: string | null;
  prepTimeMinutes: number | null;
  estimatedDeliveryAt: string;
  timeline: { status: Status; at: string; by: Actor; reason: string | null }[];
  placedAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * `lines` and `history` may hold other orders' rows too; only this order's are
 * used, in order. `voucherCodes` maps voucher id to code.
 */
export function toOrder(
  row: OrderRow,
  lines: OrderLineRow[],
  history: StatusHistoryRow[],
  voucherCodes: ReadonlyMap<string, string>,
): Order {
  return {
    id: row.id,
    status: row.status,
    customerId: row.customerId,
    customerPhone: row.customerPhone,
    restaurant: { id: row.restaurantId, name: row.restaurantName, location: row.restaurantLocation },
    lines: lines
      .filter((l) => l.orderId === row.id)
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        itemId: l.itemId,
        name: l.name,
        quantity: l.quantity,
        options: l.options,
        note: l.note,
        unitPricePaisa: l.unitPricePaisa,
        lineTotalPaisa: l.lineTotalPaisa,
      })),
    subtotalPaisa: row.subtotalPaisa,
    deliveryFeePaisa: row.deliveryFeePaisa,
    discountPaisa: row.discountPaisa,
    voucherCode: row.voucherId ? (voucherCodes.get(row.voucherId) ?? null) : null,
    totalPaisa: row.totalPaisa,
    paymentMethod: row.paymentMethod,
    deliveryAddress: row.deliveryAddress,
    note: row.note,
    prepTimeMinutes: row.prepTimeMinutes,
    estimatedDeliveryAt: row.estimatedDeliveryAt.toISOString(),
    timeline: history
      .filter((h) => h.orderId === row.id)
      .sort((a, b) => a.id - b.id)
      .map((h) => ({ status: h.status, at: h.at.toISOString(), by: h.actor, reason: h.reason })),
    placedAt: row.placedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
